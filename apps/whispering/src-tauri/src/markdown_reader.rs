use std::fs;
use std::path::PathBuf;

/// Reads all markdown files from a directory and returns their contents as strings.
/// This is optimized for bulk reading transformation runs without the TypeScript FFI overhead.
///
/// # Arguments
/// * `directory_path` - Absolute path to the directory containing .md files
///
/// # Returns
/// * `Ok(Vec<String>)` - Array of markdown file contents
/// * `Err(String)` - Error message if reading fails
#[tauri::command]
pub async fn read_markdown_files(directory_path: String) -> Result<Vec<String>, String> {
    let dir_path = PathBuf::from(&directory_path);

    // Check if directory exists
    if !dir_path.exists() {
        return Ok(Vec::new());
    }

    if !dir_path.is_dir() {
        return Err(format!("{} is not a directory", directory_path));
    }

    // Read directory entries and filter/map to markdown file contents
    let contents: Vec<String> = fs::read_dir(&dir_path)
        .map_err(|e| format!("Failed to read directory {}: {}", directory_path, e))?
        .filter_map(|entry| {
            // Extract valid entry or skip
            let entry = entry.ok()?;
            let path = entry.path();

            // Only process .md files
            if path.is_file() && path.extension()? == "md" {
                fs::read_to_string(&path).ok()
            } else {
                None
            }
        })
        .collect();

    Ok(contents)
}
