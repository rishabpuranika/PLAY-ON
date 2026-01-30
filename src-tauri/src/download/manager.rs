use crate::download::provider::{DownloadProvider, DownloadRequest, DownloadState};
use crate::storage_prefs::StorageManager;
use reqwest::Client;
use std::io::Read;
use std::io::Write;
use std::path::Path;
use std::sync::Arc;
use tokio::sync::{mpsc, RwLock};
pub struct DownloadManager {
    client: Client,
    provider: DownloadProvider,
    queue: Arc<RwLock<Vec<DownloadRequest>>>,
    state_tx: mpsc::Sender<(String, DownloadState)>,
    active_downloads: Arc<RwLock<usize>>,
    max_concurrent: usize,
}

impl DownloadManager {
    pub fn new(storage_manager: StorageManager) -> (Self, mpsc::Receiver<(String, DownloadState)>) {
        let (tx, rx) = mpsc::channel(100);
        let provider = DownloadProvider::new(storage_manager);

        (
            Self {
                client: Client::new(),
                provider,
                queue: Arc::new(RwLock::new(Vec::new())),
                state_tx: tx,
                active_downloads: Arc::new(RwLock::new(0)),
                max_concurrent: 3, // Limit concurrent downloads like Mihon
            },
            rx,
        )
    }

    pub async fn queue_chapter(&self, request: DownloadRequest) -> Result<(), String> {
        // Check if already downloaded (Mihon filters existing)
        if self.provider.is_chapter_downloaded(&request).await? {
            return Ok(());
        }

        let mut queue = self.queue.write().await;

        // Check if already in queue
        if !queue.iter().any(|r| r.id == request.id) {
            queue.push(request);
            // We need to trigger processing somehow.
            // In strict Rust async, we can't easily "fire and forget" a self method if it captures self without cloning.
            // But here we can spawn the processor.
            let self_clone = self.clone();
            tokio::spawn(async move {
                let _ = self_clone.process_queue().await;
            });
        }

        Ok(())
    }

    async fn process_queue(&self) -> Result<(), String> {
        loop {
            let mut active = self.active_downloads.write().await;
            if *active >= self.max_concurrent {
                break;
            }

            let next = {
                let mut queue = self.queue.write().await;
                if queue.is_empty() {
                    None
                } else {
                    Some(queue.remove(0))
                }
            };

            if let Some(request) = next {
                *active += 1;
                let self_clone = self.clone();
                tokio::spawn(async move {
                    let _ = self_clone.download_chapter(request).await;
                    *self_clone.active_downloads.write().await -= 1;
                });
            } else {
                break;
            }
        }

        Ok(())
    }

    async fn download_chapter(&self, request: DownloadRequest) -> Result<(), String> {
        // Notify starting
        let _ = self
            .state_tx
            .send((
                request.id.clone(),
                DownloadState::Downloading { progress: 0.0 },
            ))
            .await;

        let chapter_path = self.provider.get_chapter_dir(&request).await?;

        // Create temp directory for images
        let temp_dir = chapter_path.with_extension("tmp");
        tokio::fs::create_dir_all(&temp_dir)
            .await
            .map_err(|e| e.to_string())?;

        // Download all images
        let total_images = request.image_urls.len();
        for (idx, url) in request.image_urls.iter().enumerate() {
            let ext = url.split('.').last().unwrap_or("jpg");
            let img_path = temp_dir.join(format!("{:03}.{}", idx + 1, ext));

            match self.download_image(url, &img_path).await {
                Ok(_) => {
                    let progress = (idx + 1) as f32 / total_images as f32;
                    let _ = self
                        .state_tx
                        .send((request.id.clone(), DownloadState::Downloading { progress }))
                        .await;
                }
                Err(e) => {
                    let _ = self
                        .state_tx
                        .send((request.id.clone(), DownloadState::Error(e.to_string())))
                        .await;
                    return Ok(());
                }
            }
        }

        // Create CBZ archive (zip)
        self.create_cbz(&temp_dir, &chapter_path).await?;

        // Cleanup temp
        let _ = tokio::fs::remove_dir_all(&temp_dir).await;

        // Mark completed
        let _ = self
            .state_tx
            .send((request.id.clone(), DownloadState::Completed))
            .await;

        Ok(())
    }

    async fn download_image(&self, url: &str, path: &std::path::Path) -> Result<(), String> {
        let response = self
            .client
            .get(url)
            .send()
            .await
            .map_err(|e| format!("Request failed: {}", e))?;

        let bytes = response
            .bytes()
            .await
            .map_err(|e| format!("Failed to read bytes: {}", e))?;

        tokio::fs::write(path, bytes)
            .await
            .map_err(|e| format!("Failed to write file: {}", e))?;

        Ok(())
    }

    async fn create_cbz(&self, source_dir: &Path, dest_path: &Path) -> Result<(), String> {
        // Use standard sync fs for zip creation as zip crate is synchronous
        let file = std::fs::File::create(dest_path).map_err(|e| e.to_string())?;
        let mut zip = zip::ZipWriter::new(file);

        let options =
            zip::write::FileOptions::default().compression_method(zip::CompressionMethod::Stored);

        let mut entries: tokio::fs::ReadDir = tokio::fs::read_dir(source_dir)
            .await
            .map_err(|e| e.to_string())?;

        while let Some(entry) = entries
            .next_entry()
            .await
            .map_err(|e: std::io::Error| e.to_string())?
        {
            let path = entry.path();
            if path.is_file() {
                let name = path.file_name().unwrap().to_str().unwrap();
                let mut f = std::fs::File::open(&path).map_err(|e| e.to_string())?;
                let mut buffer = Vec::new();
                f.read_to_end(&mut buffer).map_err(|e| e.to_string())?;

                zip.start_file(name, options).map_err(|e| e.to_string())?;
                zip.write_all(&buffer).map_err(|e| e.to_string())?;
            }
        }

        zip.finish().map_err(|e| e.to_string())?;
        Ok(())
    }
}

impl Clone for DownloadManager {
    fn clone(&self) -> Self {
        Self {
            client: self.client.clone(),
            provider: self.provider.clone(),
            queue: self.queue.clone(),
            state_tx: self.state_tx.clone(),
            active_downloads: self.active_downloads.clone(),
            max_concurrent: self.max_concurrent,
        }
    }
}
