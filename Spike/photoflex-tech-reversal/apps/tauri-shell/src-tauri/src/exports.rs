use serde::{Deserialize, Serialize};
use sha2::{Digest, Sha256};
use std::{
    collections::HashMap,
    fs,
    path::PathBuf,
    sync::{
        atomic::{AtomicBool, Ordering},
        Arc, Mutex,
    },
    thread,
    time::{Duration, SystemTime, UNIX_EPOCH},
};

#[derive(Clone, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ExportRequest {
    pub project_id: String,
    pub page_ids: Vec<String>,
}

#[derive(Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct JobEvent {
    pub job_id: String,
    pub state: String,
    pub completed: usize,
    pub total: usize,
    pub errors: Vec<String>,
    pub emitted_at: String,
    pub worker_stopped: bool,
}

struct Job {
    request: ExportRequest,
    state: String,
    completed: usize,
    error: Option<String>,
    cancel: Arc<AtomicBool>,
    worker_stopped: bool,
}

#[derive(Clone)]
pub struct ExportQueue {
    root: PathBuf,
    jobs: Arc<Mutex<HashMap<String, Job>>>,
}

fn now_label() -> String {
    SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .unwrap_or_default()
        .as_nanos()
        .to_string()
}

fn job_event(job_id: &str, job: &Job) -> JobEvent {
    JobEvent {
        job_id: job_id.to_string(),
        state: job.state.clone(),
        completed: job.completed,
        total: job.request.page_ids.len(),
        errors: job.error.iter().cloned().collect(),
        emitted_at: now_label(),
        worker_stopped: job.worker_stopped,
    }
}

fn pdf_text(value: &str) -> String {
    value
        .chars()
        .map(|character| {
            if !character.is_ascii_graphic() && character != ' ' {
                '?'.to_string()
            } else if matches!(character, '\\' | '(' | ')') {
                format!("\\{character}")
            } else {
                character.to_string()
            }
        })
        .collect()
}

fn create_pdf(labels: &[String]) -> Vec<u8> {
    let font_id = 3 + labels.len() * 2;
    let page_ids: Vec<usize> = (0..labels.len()).map(|index| 3 + index * 2).collect();
    let mut objects = vec![String::new(); font_id + 1];
    objects[1] = "<< /Type /Catalog /Pages 2 0 R >>".into();
    objects[2] = format!(
        "<< /Type /Pages /Kids [{}] /Count {} >>",
        page_ids
            .iter()
            .map(|id| format!("{id} 0 R"))
            .collect::<Vec<_>>()
            .join(" "),
        labels.len()
    );
    for (index, label) in labels.iter().enumerate() {
        let page_id = page_ids[index];
        let content_id = page_id + 1;
        let content = format!(
            "BT /F1 18 Tf 54 760 Td (PhotoFlex benchmark page {}) Tj 0 -28 Td ({}) Tj ET",
            index + 1,
            pdf_text(label)
        );
        objects[page_id] = format!("<< /Type /Page /Parent 2 0 R /MediaBox [0 0 595 842] /Resources << /Font << /F1 {font_id} 0 R >> >> /Contents {content_id} 0 R >>");
        objects[content_id] = format!(
            "<< /Length {} >>\nstream\n{content}\nendstream",
            content.len()
        );
    }
    objects[font_id] = "<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>".into();
    let mut document = "%PDF-1.4\n".to_string();
    let mut offsets = vec![0; font_id + 1];
    for id in 1..=font_id {
        offsets[id] = document.len();
        document.push_str(&format!("{id} 0 obj\n{}\nendobj\n", objects[id]));
    }
    let xref_offset = document.len();
    document.push_str(&format!("xref\n0 {}\n0000000000 65535 f \n", font_id + 1));
    for offset in offsets.iter().skip(1) {
        document.push_str(&format!("{offset:010} 00000 n \n"));
    }
    document.push_str(&format!(
        "trailer\n<< /Size {} /Root 1 0 R >>\nstartxref\n{xref_offset}\n%%EOF\n",
        font_id + 1
    ));
    document.into_bytes()
}

impl ExportQueue {
    pub fn new(app_data_root: PathBuf) -> Self {
        Self {
            root: app_data_root.join("benchmark-exports"),
            jobs: Arc::new(Mutex::new(HashMap::new())),
        }
    }

    pub fn start_pdf(&self, request: ExportRequest) -> Result<String, String> {
        if request.project_id.is_empty() {
            return Err("project ID is required".into());
        }
        if request.page_ids.is_empty() || request.page_ids.len() > 200 {
            return Err("PDF request must contain between 1 and 200 page IDs".into());
        }
        fs::create_dir_all(&self.root).map_err(|error| error.to_string())?;
        let job_id = hex::encode(Sha256::digest(
            format!(
                "{}:{}:{}",
                request.project_id,
                now_label(),
                request.page_ids.len()
            )
            .as_bytes(),
        ))[..24]
            .to_string();
        let temporary_path = self.root.join(format!(".{job_id}.pdf.tmp"));
        let destination_path = self.root.join(format!("{job_id}.pdf"));
        let cancel = Arc::new(AtomicBool::new(false));
        self.jobs
            .lock()
            .map_err(|_| "export queue lock poisoned".to_string())?
            .insert(
                job_id.clone(),
                Job {
                    request: request.clone(),
                    state: "queued".into(),
                    completed: 0,
                    error: None,
                    cancel: cancel.clone(),
                    worker_stopped: false,
                },
            );
        let jobs = self.jobs.clone();
        let worker_job_id = job_id.clone();
        thread::spawn(move || {
            if let Ok(mut jobs) = jobs.lock() {
                if let Some(job) = jobs.get_mut(&worker_job_id) {
                    job.state = "running".into();
                }
            }
            for completed in 1..=request.page_ids.len() {
                thread::sleep(Duration::from_millis(1));
                if cancel.load(Ordering::SeqCst) {
                    let _ = fs::remove_file(&temporary_path);
                    if let Ok(mut jobs) = jobs.lock() {
                        if let Some(job) = jobs.get_mut(&worker_job_id) {
                            job.state = "cancelled".into();
                            job.worker_stopped = true;
                        }
                    }
                    return;
                }
                if let Ok(mut jobs) = jobs.lock() {
                    if let Some(job) = jobs.get_mut(&worker_job_id) {
                        job.completed = completed;
                    }
                }
            }
            let result = fs::write(&temporary_path, create_pdf(&request.page_ids))
                .and_then(|_| fs::rename(&temporary_path, &destination_path));
            if let Ok(mut jobs) = jobs.lock() {
                if let Some(job) = jobs.get_mut(&worker_job_id) {
                    match result {
                        Ok(()) => job.state = "succeeded".into(),
                        Err(error) => {
                            job.state = "failed".into();
                            job.error = Some(error.to_string());
                        }
                    }
                    job.worker_stopped = true;
                }
            }
        });
        Ok(job_id)
    }

    pub fn status(&self, job_id: String) -> Result<JobEvent, String> {
        let jobs = self
            .jobs
            .lock()
            .map_err(|_| "export queue lock poisoned".to_string())?;
        let job = jobs
            .get(&job_id)
            .ok_or_else(|| "unknown export job".to_string())?;
        Ok(job_event(&job_id, job))
    }

    pub fn save_pdf_to(&self, job_id: &str, destination: &PathBuf) -> Result<(), String> {
        let source = {
            let jobs = self
                .jobs
                .lock()
                .map_err(|_| "export queue lock poisoned".to_string())?;
            let job = jobs
                .get(job_id)
                .ok_or_else(|| "unknown export job".to_string())?;
            if job.state != "succeeded" || !job.worker_stopped {
                return Err("PDF job has not completed successfully".into());
            }
            self.root.join(format!("{job_id}.pdf"))
        };
        if !source.is_file() {
            return Err("completed PDF file is missing".into());
        }
        fs::copy(source, destination).map_err(|error| error.to_string())?;
        Ok(())
    }

    pub fn cancel(&self, job_id: String) -> Result<JobEvent, String> {
        let mut jobs = self
            .jobs
            .lock()
            .map_err(|_| "export queue lock poisoned".to_string())?;
        let job = jobs
            .get_mut(&job_id)
            .ok_or_else(|| "unknown export job".to_string())?;
        job.cancel.store(true, Ordering::SeqCst);
        if matches!(job.state.as_str(), "queued" | "running") {
            job.state = "cancelled".into();
        }
        Ok(job_event(&job_id, job))
    }

    pub fn retry(&self, job_id: String) -> Result<String, String> {
        let request = {
            let jobs = self
                .jobs
                .lock()
                .map_err(|_| "export queue lock poisoned".to_string())?;
            let job = jobs
                .get(&job_id)
                .ok_or_else(|| "unknown export job".to_string())?;
            if !matches!(job.state.as_str(), "cancelled" | "failed") {
                return Err("only cancelled or failed jobs can be retried".into());
            }
            job.request.clone()
        };
        self.start_pdf(request)
    }

    #[cfg(test)]
    fn paths(&self, job_id: &str) -> (PathBuf, PathBuf) {
        (
            self.root.join(format!(".{job_id}.pdf.tmp")),
            self.root.join(format!("{job_id}.pdf")),
        )
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    fn wait(queue: &ExportQueue, job_id: &str) -> JobEvent {
        for _ in 0..300 {
            let status = queue.status(job_id.to_string()).unwrap();
            if status.worker_stopped {
                return status;
            }
            thread::sleep(Duration::from_millis(10));
        }
        panic!("PDF worker did not stop");
    }

    #[test]
    fn generates_cancels_cleans_and_retries() {
        let root = std::env::temp_dir().join(format!("photoflex-tauri-export-{}", now_label()));
        let queue = ExportQueue::new(root.clone());
        let request = ExportRequest {
            project_id: "project".into(),
            page_ids: (0..200).map(|index| format!("photo-{index}")).collect(),
        };
        let completed = queue.start_pdf(request.clone()).unwrap();
        assert_eq!(wait(&queue, &completed).state, "succeeded");
        let (_, output) = queue.paths(&completed);
        assert!(fs::read(output).unwrap().starts_with(b"%PDF-1.4"));
        let cancelled = queue.start_pdf(request).unwrap();
        assert_eq!(queue.cancel(cancelled.clone()).unwrap().state, "cancelled");
        assert_eq!(wait(&queue, &cancelled).state, "cancelled");
        let (temporary, _) = queue.paths(&cancelled);
        assert!(!temporary.exists());
        let retried = queue.retry(cancelled).unwrap();
        assert_eq!(wait(&queue, &retried).state, "succeeded");
        fs::remove_dir_all(root).unwrap();
    }
}
