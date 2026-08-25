use serde::{Deserialize, Serialize};
use sha2::{Digest, Sha256};
use std::{
    collections::{BTreeMap, HashMap},
    fs,
    io::Cursor,
    path::{Path, PathBuf},
    sync::{Mutex, RwLock},
    time::{SystemTime, UNIX_EPOCH},
};

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct SourceGrant {
    pub source_id: String,
    pub display_name: String,
    pub restored: bool,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct SourceEntry {
    pub photo_id: String,
    pub source_id: String,
    pub relative_path: String,
    pub proxy_url: String,
    pub width: u32,
    pub height: u32,
    pub bytes: u64,
}

#[derive(Default, Serialize, Deserialize)]
struct Registry(BTreeMap<String, PathBuf>);

#[derive(Clone, Serialize, Deserialize)]
struct IndexedPhoto {
    photo_id: String,
    relative_path: String,
    absolute_path: PathBuf,
    bytes: u64,
    cache_key: String,
}

pub struct ResolvedSource {
    pub absolute_path: PathBuf,
    pub content_type: &'static str,
    pub cache_key: String,
}

fn now_nanos() -> u128 {
    SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .unwrap_or_default()
        .as_nanos()
}

fn is_supported_photo(path: &Path) -> bool {
    path.extension()
        .and_then(|value| value.to_str())
        .map(|extension| {
            matches!(
                extension.to_ascii_lowercase().as_str(),
                "jpg" | "jpeg" | "png" | "tif" | "tiff" | "webp" | "heic" | "heif"
            )
        })
        .unwrap_or(false)
}

pub fn canonical_within(root: &Path, candidate: &Path) -> bool {
    let Ok(root) = fs::canonicalize(root) else {
        return false;
    };
    let Ok(candidate) = fs::canonicalize(candidate) else {
        return false;
    };
    candidate.starts_with(root)
}

fn walk_photos(root: &Path, directory: &Path, output: &mut Vec<PathBuf>) -> Result<(), String> {
    let mut entries = fs::read_dir(directory)
        .map_err(|error| error.to_string())?
        .collect::<Result<Vec<_>, _>>()
        .map_err(|error| error.to_string())?;
    entries.sort_by_key(|entry| entry.file_name());
    for entry in entries {
        let file_type = entry.file_type().map_err(|error| error.to_string())?;
        if file_type.is_symlink() {
            continue;
        }
        let path = entry.path();
        if !canonical_within(root, &path) {
            continue;
        }
        if file_type.is_dir() {
            walk_photos(root, &path, output)?;
        } else if file_type.is_file() && is_supported_photo(&path) {
            output.push(path);
        }
    }
    Ok(())
}

pub struct SourceService {
    app_data_root: PathBuf,
    registry_path: PathBuf,
    indexes: RwLock<HashMap<String, Vec<IndexedPhoto>>>,
    thumbnail_lock: Mutex<()>,
}

impl SourceService {
    pub fn new(app_data_root: PathBuf) -> Self {
        Self {
            app_data_root: app_data_root.clone(),
            registry_path: app_data_root.join("source-grants.json"),
            indexes: RwLock::new(HashMap::new()),
            thumbnail_lock: Mutex::new(()),
        }
    }

    fn index_path(&self, source_id: &str) -> PathBuf {
        self.app_data_root
            .join("source-indexes")
            .join(format!("{source_id}.json"))
    }

    fn proxy_origin() -> &'static str {
        if cfg!(windows) {
            "http://photoflex-source.localhost"
        } else {
            "photoflex-source://localhost"
        }
    }

    fn build_index(&self, source_id: &str, root: &Path) -> Result<Vec<IndexedPhoto>, String> {
        let mut files = Vec::new();
        walk_photos(root, root, &mut files)?;
        let mut records = Vec::with_capacity(files.len());
        for path in files {
            let absolute_path = fs::canonicalize(&path).map_err(|error| error.to_string())?;
            if !canonical_within(root, &absolute_path) {
                continue;
            }
            let relative_path = absolute_path
                .strip_prefix(root)
                .map_err(|error| error.to_string())?
                .to_string_lossy()
                .to_string();
            let photo_id = hex::encode(Sha256::digest(relative_path.replace('\\', "/").as_bytes()))
                [..24]
                .to_string();
            let metadata = fs::metadata(&absolute_path).map_err(|error| error.to_string())?;
            let modified = metadata
                .modified()
                .ok()
                .and_then(|value| value.duration_since(UNIX_EPOCH).ok())
                .map(|value| value.as_nanos())
                .unwrap_or_default();
            let cache_key = hex::encode(Sha256::digest(
                format!(
                    "{}\0{}\0{modified}",
                    absolute_path.display(),
                    metadata.len()
                )
                .as_bytes(),
            ));
            records.push(IndexedPhoto {
                photo_id,
                relative_path,
                absolute_path,
                bytes: metadata.len(),
                cache_key,
            });
        }
        let index_path = self.index_path(source_id);
        if let Some(parent) = index_path.parent() {
            fs::create_dir_all(parent).map_err(|error| error.to_string())?;
        }
        let temporary = index_path.with_extension(format!("{}.tmp", now_nanos()));
        fs::write(
            &temporary,
            serde_json::to_vec(&records).map_err(|error| error.to_string())?,
        )
        .map_err(|error| error.to_string())?;
        fs::rename(temporary, index_path).map_err(|error| error.to_string())?;
        Ok(records)
    }

    fn load_or_build_index(
        &self,
        source_id: &str,
        root: &Path,
    ) -> Result<Vec<IndexedPhoto>, String> {
        if let Some(records) = self
            .indexes
            .read()
            .map_err(|_| "source index lock poisoned".to_string())?
            .get(source_id)
            .cloned()
        {
            return Ok(records);
        }
        let records = match fs::read(self.index_path(source_id)) {
            Ok(bytes) => serde_json::from_slice(&bytes).map_err(|error| error.to_string()),
            Err(error) if error.kind() == std::io::ErrorKind::NotFound => {
                self.build_index(source_id, root)
            }
            Err(error) => Err(error.to_string()),
        }?;
        self.indexes
            .write()
            .map_err(|_| "source index lock poisoned".to_string())?
            .insert(source_id.to_string(), records.clone());
        Ok(records)
    }

    fn load_registry(&self) -> Result<Registry, String> {
        match fs::read_to_string(&self.registry_path) {
            Ok(contents) => serde_json::from_str(&contents).map_err(|error| error.to_string()),
            Err(error) if error.kind() == std::io::ErrorKind::NotFound => Ok(Registry::default()),
            Err(error) => Err(error.to_string()),
        }
    }

    fn save_registry(&self, registry: &Registry) -> Result<(), String> {
        if let Some(parent) = self.registry_path.parent() {
            fs::create_dir_all(parent).map_err(|error| error.to_string())?;
        }
        let temporary = self
            .registry_path
            .with_extension(format!("{}.tmp", now_nanos()));
        fs::write(
            &temporary,
            format!(
                "{}\n",
                serde_json::to_string_pretty(registry).map_err(|error| error.to_string())?
            ),
        )
        .map_err(|error| error.to_string())?;
        fs::rename(temporary, &self.registry_path).map_err(|error| error.to_string())
    }

    pub fn register_folder(&self, folder: PathBuf) -> Result<SourceGrant, String> {
        let root = fs::canonicalize(folder).map_err(|error| error.to_string())?;
        if !root.is_dir() {
            return Err("selected source is not a directory".into());
        }
        let source_id = hex::encode(Sha256::digest(
            format!("{}:{}", root.display(), now_nanos()).as_bytes(),
        ))[..24]
            .to_string();
        let mut registry = self.load_registry()?;
        registry.0.insert(source_id.clone(), root.clone());
        self.save_registry(&registry)?;
        Ok(SourceGrant {
            source_id,
            display_name: root
                .file_name()
                .and_then(|value| value.to_str())
                .unwrap_or("source")
                .to_string(),
            restored: false,
        })
    }

    pub fn restore_grant(&self, source_id: String) -> Result<SourceGrant, String> {
        let registry = self.load_registry()?;
        let root = registry
            .0
            .get(&source_id)
            .ok_or_else(|| "unknown or expired source grant".to_string())?;
        let canonical = fs::canonicalize(root).map_err(|error| error.to_string())?;
        if !canonical.is_dir() {
            return Err("source grant is no longer a directory".into());
        }
        self.indexes
            .write()
            .map_err(|_| "source index lock poisoned".to_string())?
            .remove(&source_id);
        match fs::remove_file(self.index_path(&source_id)) {
            Ok(()) => {}
            Err(error) if error.kind() == std::io::ErrorKind::NotFound => {}
            Err(error) => return Err(error.to_string()),
        }
        Ok(SourceGrant {
            source_id,
            display_name: canonical
                .file_name()
                .and_then(|value| value.to_str())
                .unwrap_or("source")
                .to_string(),
            restored: true,
        })
    }

    pub fn query(
        &self,
        source_id: String,
        offset: usize,
        limit: usize,
    ) -> Result<Vec<SourceEntry>, String> {
        if limit == 0 || limit > 500 {
            return Err("invalid page request".into());
        }
        let registry = self.load_registry()?;
        let root = registry
            .0
            .get(&source_id)
            .ok_or_else(|| "unknown or expired source grant".to_string())?;
        let root = fs::canonicalize(root).map_err(|error| error.to_string())?;
        let records = self.load_or_build_index(&source_id, &root)?;
        Ok(records
            .into_iter()
            .skip(offset)
            .take(limit)
            .map(|record| SourceEntry {
                photo_id: record.photo_id.clone(),
                source_id: source_id.clone(),
                relative_path: record.relative_path,
                proxy_url: format!(
                    "{}{}/{}",
                    Self::proxy_origin(),
                    format!("/photo/{source_id}"),
                    record.photo_id
                ),
                width: 0,
                height: 0,
                bytes: record.bytes,
            })
            .collect())
    }

    pub fn resolve_proxy(&self, source_id: &str, photo_id: &str) -> Result<ResolvedSource, String> {
        let registry = self.load_registry()?;
        let root = registry
            .0
            .get(source_id)
            .ok_or_else(|| "unknown or expired source grant".to_string())?;
        let root = fs::canonicalize(root).map_err(|error| error.to_string())?;
        let records = self.load_or_build_index(source_id, &root)?;
        let record = records
            .into_iter()
            .find(|record| record.photo_id == photo_id)
            .ok_or_else(|| "unknown photo ID".to_string())?;
        let absolute_path =
            fs::canonicalize(record.absolute_path).map_err(|error| error.to_string())?;
        if !canonical_within(&root, &absolute_path) {
            return Err("source path escaped grant root".into());
        }
        let content_type = match absolute_path
            .extension()
            .and_then(|value| value.to_str())
            .unwrap_or_default()
            .to_ascii_lowercase()
            .as_str()
        {
            "jpg" | "jpeg" => "image/jpeg",
            "png" => "image/png",
            "tif" | "tiff" => "image/tiff",
            "webp" => "image/webp",
            "heic" => "image/heic",
            "heif" => "image/heif",
            _ => "application/octet-stream",
        };
        Ok(ResolvedSource {
            absolute_path,
            content_type,
            cache_key: record.cache_key,
        })
    }

    pub fn read_proxy(
        &self,
        source_id: &str,
        photo_id: &str,
        thumbnail: bool,
    ) -> Result<(Vec<u8>, &'static str), String> {
        let resolved = self.resolve_proxy(source_id, photo_id)?;
        if !thumbnail {
            return fs::read(resolved.absolute_path)
                .map(|bytes| (bytes, resolved.content_type))
                .map_err(|error| error.to_string());
        }
        let cache_path = self
            .app_data_root
            .join("source-proxies")
            .join(format!("{}.jpg", resolved.cache_key));
        if let Ok(bytes) = fs::read(&cache_path) {
            return Ok((bytes, "image/jpeg"));
        }
        // A viewport can request many thumbnails at once. Serialize only the
        // cache-miss/decode path so several large source images are not decoded
        // concurrently and causing a large transient RSS spike.
        let _thumbnail_guard = self
            .thumbnail_lock
            .lock()
            .map_err(|_| "thumbnail lock poisoned".to_string())?;
        if let Ok(bytes) = fs::read(&cache_path) {
            return Ok((bytes, "image/jpeg"));
        }
        if let Some(parent) = cache_path.parent() {
            fs::create_dir_all(parent).map_err(|error| error.to_string())?;
        }
        let image = image::ImageReader::open(&resolved.absolute_path)
            .map_err(|error| error.to_string())?
            .with_guessed_format()
            .map_err(|error| error.to_string())?
            .decode()
            .map_err(|error| error.to_string())?;
        // 256px is enough for the grid cards and normal whiteboard cards,
        // while reducing decoded-image memory in the WebView.
        let thumbnail = image.thumbnail(256, 256);
        let mut bytes = Vec::new();
        image::codecs::jpeg::JpegEncoder::new_with_quality(Cursor::new(&mut bytes), 78)
            .encode_image(&thumbnail)
            .map_err(|error| error.to_string())?;
        let temporary = cache_path.with_extension(format!("{}.tmp", now_nanos()));
        fs::write(&temporary, &bytes).map_err(|error| error.to_string())?;
        match fs::rename(&temporary, &cache_path) {
            Ok(()) => Ok((bytes, "image/jpeg")),
            Err(_) if cache_path.is_file() => {
                let _ = fs::remove_file(temporary);
                fs::read(cache_path)
                    .map(|cached| (cached, "image/jpeg"))
                    .map_err(|error| error.to_string())
            }
            Err(error) => {
                let _ = fs::remove_file(temporary);
                Err(error.to_string())
            }
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    fn test_root() -> PathBuf {
        std::env::temp_dir().join(format!("photoflex-tauri-source-{}", now_nanos()))
    }

    #[test]
    fn grants_page_restore_and_reject_outside_paths() {
        let root = test_root();
        let source = root.join("source");
        let outside = root.join("outside");
        fs::create_dir_all(source.join("nested")).unwrap();
        fs::create_dir_all(&outside).unwrap();
        fs::write(source.join("one.jpg"), [1, 2, 3]).unwrap();
        image::RgbImage::from_pixel(32, 16, image::Rgb([20, 80, 140]))
            .save(source.join("nested").join("two.png"))
            .unwrap();
        fs::write(outside.join("outside.jpg"), [7, 8, 9]).unwrap();
        let service = SourceService::new(root.join("app-data"));
        let grant = service.register_folder(source.clone()).unwrap();
        assert_eq!(
            service.query(grant.source_id.clone(), 0, 1).unwrap().len(),
            1
        );
        assert_eq!(
            service.query(grant.source_id.clone(), 1, 10).unwrap().len(),
            1
        );
        let entries = service.query(grant.source_id.clone(), 0, 10).unwrap();
        let expected_origin = SourceService::proxy_origin();
        assert!(entries
            .iter()
            .all(|entry| entry.proxy_url.starts_with(expected_origin)));
        let valid = entries
            .iter()
            .find(|entry| entry.relative_path.ends_with("two.png"))
            .unwrap();
        let (thumbnail, content_type) = service
            .read_proxy(&grant.source_id, &valid.photo_id, true)
            .unwrap();
        assert_eq!(content_type, "image/jpeg");
        assert!(thumbnail.starts_with(&[0xff, 0xd8, 0xff]));
        assert!(service.restore_grant(grant.source_id).unwrap().restored);
        assert!(canonical_within(&source, &source.join("one.jpg")));
        assert!(!canonical_within(&source, &outside.join("outside.jpg")));
        fs::remove_dir_all(root).unwrap();
    }
}
