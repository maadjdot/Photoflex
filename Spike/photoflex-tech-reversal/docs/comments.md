# Test Result
**Tauri**
| Gate | 是否通过 | 备注 |
|---|---|---|
| T-01 大型网格 | 通过 | / |
| T-02 Sequence | 通过 |
| DB-01 恢复 | 通过 |
| T-03 Sidecar | 干净安装 5/5；metadata 20/20；原文件 hash/mtime/path 零变化 |
| T-04 PDF | 通过 |
| T-05 权限 | 通过 |
| T-06 预览 | 未测试 |
| PKG-01 | 未测试 |
| WB-01 | 不通过 | 峰值RSS达到1200mb，空闲进程树为600mb,100 项组移动/批量删除 p95 > 100 ms |

# electron
- MIX-01 峰值RSS 1300MB，空闲670MB
- latancyMS都在180-300之间，大于150ms

