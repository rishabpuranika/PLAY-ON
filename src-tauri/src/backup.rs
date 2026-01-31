use chrono::{DateTime, Local};
use serde::{Deserialize, Serialize};
use std::fs;
use std::path::{Path, PathBuf};
use tauri::{command, AppHandle, Manager};

// Define CommandResult locally if not imported from crate::error
// Assuming crate::error::CommandResult exists based on user prompt,
// but if it doesn't I might need to replace it.
// The user prompt had: use crate::error::CommandResult;
// I'll check lib.rs imports later, but for now I'll use String as error for safety if I can't verify crate::error exists yet.
// Actually, looking at the user provided code, they used `crate::error::CommandResult`.
// I'll stick to their code but if it fails I'll fix it.
// Wait, I saw lib.rs content earlier, did it have `mod error`?
// The `list_dir` of `src-tauri/src` showed: anilist.rs, cbz_reader.rs, download/, downloader.rs, file_system.rs, lib.rs, main.rs, media_player.rs, myanimelist.rs, storage_prefs.rs, title_parser.rs.
// It did NOT show `error.rs`.
// So `crate::error::CommandResult` might not exist.
// I should probably define a generic Result alias or standard Result<T, String> to be safe,
// OR check if I should create error.rs.
// Given the user provided the code explicitly, maybe they expect me to use it, OR I should adapt it.
// I will adapt it to use `Result<T, String>` to be safe and avoid compilation errors if `error.rs` is missing.

// Re-implementation with standard Result<T, String> for reliability unless I confirm error structure.

#[derive(Debug, Serialize, Deserialize)]
pub struct BackupConfig {
    pub auto_backup_enabled: bool,
    pub backup_frequency: String,
    pub backup_location: String,
    pub last_backup_date: Option<String>,
    pub backup_count: i32,
    pub include_media_cache: bool,
    pub max_backups: i32,
}

#[derive(Debug, Serialize)]
pub struct BackupInfo {
    name: String,
    date: String,
    size: String,
}

#[command]
pub async fn get_backup_config(app: AppHandle) -> Result<Option<BackupConfig>, String> {
    let config_path = get_config_path(&app)?;

    if !config_path.exists() {
        return Ok(None);
    }

    let content = fs::read_to_string(config_path).map_err(|e| e.to_string())?;
    let config: BackupConfig = serde_json::from_str(&content).map_err(|e| e.to_string())?;
    Ok(Some(config))
}

#[command]
pub async fn save_backup_config(app: AppHandle, config: BackupConfig) -> Result<(), String> {
    let config_path = get_config_path(&app)?;

    if let Some(parent) = config_path.parent() {
        fs::create_dir_all(parent).map_err(|e| e.to_string())?;
    }

    let json = serde_json::to_string_pretty(&config).map_err(|e| e.to_string())?;
    fs::write(config_path, json).map_err(|e| e.to_string())?;
    Ok(())
}

#[command]
pub async fn create_backup(
    app: AppHandle,
    include_media: bool,
) -> Result<serde_json::Value, String> {
    let timestamp = Local::now().format("%Y-%m-%d_%H-%M-%S").to_string();
    let backup_name = format!("play-on-backup-{}.pobak", timestamp);

    let config = get_backup_config(app.clone()).await?.unwrap_or_default();
    let backup_dir = if config.backup_location.is_empty() {
        get_default_backup_dir(&app)?
    } else {
        PathBuf::from(&config.backup_location)
    };

    fs::create_dir_all(&backup_dir).map_err(|e| e.to_string())?;

    let backup_path = backup_dir.join(&backup_name);

    // Create backup data
    let backup_data = create_backup_data(&app, include_media).await?;
    let json_data = serde_json::to_string_pretty(&backup_data).map_err(|e| e.to_string())?;

    // Compress and save (simple zip-like approach or just JSON for now)
    fs::write(&backup_path, json_data).map_err(|e| e.to_string())?;

    // Clean old backups
    cleanup_old_backups(&backup_dir, config.max_backups).await?;

    Ok(serde_json::json!({
        "success": true,
        "path": backup_path.to_string_lossy()
    }))
}

#[command]
pub async fn restore_backup(app: AppHandle, path: String) -> Result<serde_json::Value, String> {
    let backup_path = PathBuf::from(path);

    if !backup_path.exists() {
        return Ok(serde_json::json!({
            "success": false,
            "error": "Backup file not found"
        }));
    }

    // Create safety backup first
    let _ = create_backup(app.clone(), false).await?;

    // Read and restore
    let content = fs::read_to_string(&backup_path).map_err(|e| e.to_string())?;
    let data: serde_json::Value = serde_json::from_str(&content).map_err(|e| e.to_string())?;

    restore_from_data(&app, data).await?;

    Ok(serde_json::json!({
        "success": true
    }))
}

#[command]
pub async fn list_backups(app: AppHandle) -> Result<Vec<BackupInfo>, String> {
    let config = get_backup_config(app.clone()).await?.unwrap_or_default();
    let backup_dir = if config.backup_location.is_empty() {
        get_default_backup_dir(&app)?
    } else {
        PathBuf::from(&config.backup_location)
    };

    if !backup_dir.exists() {
        return Ok(vec![]);
    }

    let mut backups = Vec::new();

    for entry in fs::read_dir(backup_dir).map_err(|e| e.to_string())? {
        let entry = entry.map_err(|e| e.to_string())?;
        let path = entry.path();

        if path.extension().map_or(false, |e| e == "pobak") {
            let metadata = entry.metadata().map_err(|e| e.to_string())?;
            let modified: DateTime<Local> = metadata.modified().map_err(|e| e.to_string())?.into();
            let size = metadata.len();

            backups.push(BackupInfo {
                name: path
                    .file_stem()
                    .unwrap_or_default()
                    .to_string_lossy()
                    .to_string(),
                date: modified.format("%Y-%m-%d %H:%M").to_string(),
                size: format_size(size),
            });
        }
    }

    backups.sort_by(|a, b| b.date.cmp(&a.date));
    Ok(backups)
}

#[command]
pub async fn export_backup_to_path(app: AppHandle, path: String) -> Result<(), String> {
    let data = create_backup_data(&app, true).await?;
    let json = serde_json::to_string_pretty(&data).map_err(|e| e.to_string())?;
    fs::write(path, json).map_err(|e| e.to_string())?;
    Ok(())
}

// Helper functions
fn get_config_path(app: &AppHandle) -> Result<PathBuf, String> {
    let app_dir = app.path().app_config_dir().map_err(|e| e.to_string())?;
    Ok(app_dir.join("backup-config.json"))
}

fn get_default_backup_dir(app: &AppHandle) -> Result<PathBuf, String> {
    // Try to get configured storage location first
    let storage_manager = crate::storage_prefs::StorageManager::new(app.clone());
    if let Some(location) = storage_manager.get_download_location() {
        let path = PathBuf::from(location);
        let backup_dir = path.join("backup");
        // Ensure it exists
        if !backup_dir.exists() {
            let _ = std::fs::create_dir_all(&backup_dir);
        }
        return Ok(backup_dir);
    }

    // Fallback for Android if not set
    #[cfg(target_os = "android")]
    {
        let path = PathBuf::from("/storage/emulated/0/PLAYON/backup");
        if !path.exists() {
            let _ = std::fs::create_dir_all(&path);
        }
        return Ok(path);
    }

    let app_dir = app.path().app_data_dir().map_err(|e| e.to_string())?;
    Ok(app_dir.join("backups"))
}

async fn create_backup_data(
    app: &AppHandle,
    include_media: bool,
) -> Result<serde_json::Value, String> {
    // Collect all app data
    let app_dir = app.path().app_config_dir().map_err(|e| e.to_string())?;

    let mut data = serde_json::json!({
        "version": env!("CARGO_PKG_VERSION"),
        "timestamp": Local::now().to_rfc3339(),
        "user_data": load_user_data(&app_dir).await?,
        "settings": load_settings(&app_dir).await?,
        "anilist_cache": load_anilist_cache(&app_dir).await?,
    });

    if include_media {
        data["media_cache"] = load_media_cache(app).await?;
    }

    Ok(data)
}

async fn load_user_data(app_dir: &Path) -> Result<serde_json::Value, String> {
    let path = app_dir.join("user-data.json");
    if path.exists() {
        let content = fs::read_to_string(path).map_err(|e| e.to_string())?;
        Ok(serde_json::from_str(&content).map_err(|e| e.to_string())?)
    } else {
        Ok(serde_json::json!({}))
    }
}

async fn load_settings(app_dir: &Path) -> Result<serde_json::Value, String> {
    let path = app_dir.join("settings.json");
    if path.exists() {
        let content = fs::read_to_string(path).map_err(|e| e.to_string())?;
        Ok(serde_json::from_str(&content).map_err(|e| e.to_string())?)
    } else {
        Ok(serde_json::json!({}))
    }
}

async fn load_anilist_cache(app_dir: &Path) -> Result<serde_json::Value, String> {
    let path = app_dir.join("anilist-cache.json");
    if path.exists() {
        let content = fs::read_to_string(path).map_err(|e| e.to_string())?;
        Ok(serde_json::from_str(&content).map_err(|e| e.to_string())?)
    } else {
        Ok(serde_json::json!({}))
    }
}

async fn load_media_cache(_app: &AppHandle) -> Result<serde_json::Value, String> {
    // Implementation for media cache
    Ok(serde_json::json!({}))
}

async fn restore_from_data(app: &AppHandle, data: serde_json::Value) -> Result<(), String> {
    let app_dir = app.path().app_config_dir().map_err(|e| e.to_string())?;

    if let Some(user_data) = data.get("user_data") {
        let path = app_dir.join("user-data.json");
        fs::write(path, user_data.to_string()).map_err(|e| e.to_string())?;
    }

    if let Some(settings) = data.get("settings") {
        let path = app_dir.join("settings.json");
        fs::write(path, settings.to_string()).map_err(|e| e.to_string())?;
    }

    if let Some(cache) = data.get("anilist_cache") {
        let path = app_dir.join("anilist-cache.json");
        fs::write(path, cache.to_string()).map_err(|e| e.to_string())?;
    }

    Ok(())
}

async fn cleanup_old_backups(backup_dir: &Path, max_count: i32) -> Result<(), String> {
    if max_count <= 0 {
        return Ok(());
    }

    let mut entries: Vec<_> = fs::read_dir(backup_dir)
        .map_err(|e| e.to_string())?
        .filter_map(|e| e.ok())
        .filter(|e| e.path().extension().map_or(false, |ext| ext == "pobak"))
        .collect();

    if entries.len() <= max_count as usize {
        return Ok(());
    }

    // Sort by modified time (oldest first)
    entries.sort_by_key(|e| {
        e.metadata()
            .and_then(|m| m.modified())
            .unwrap_or(std::time::UNIX_EPOCH)
    });

    // Remove oldest extras
    let to_remove = entries.len() - max_count as usize;
    for entry in entries.iter().take(to_remove) {
        let _ = fs::remove_file(entry.path());
    }

    Ok(())
}

fn format_size(size: u64) -> String {
    const UNITS: &[&str] = &["B", "KB", "MB", "GB"];
    let mut size = size as f64;
    let mut unit_index = 0;

    while size >= 1024.0 && unit_index < UNITS.len() - 1 {
        size /= 1024.0;
        unit_index += 1;
    }

    format!("{:.1} {}", size, UNITS[unit_index])
}

impl Default for BackupConfig {
    fn default() -> Self {
        Self {
            auto_backup_enabled: false,
            backup_frequency: "weekly".to_string(),
            backup_location: String::new(),
            last_backup_date: None,
            backup_count: 0,
            include_media_cache: false,
            max_backups: 5,
        }
    }
}
