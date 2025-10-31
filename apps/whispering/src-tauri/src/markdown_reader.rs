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
        return Ok(Vec::new()); // Return empty vec if directory doesn't exist
    }

    if !dir_path.is_dir() {
        return Err(format!("{} is not a directory", directory_path));
    }

    // Read directory entries
    let entries = fs::read_dir(&dir_path)
        .map_err(|e| format!("Failed to read directory {}: {}", directory_path, e))?;

    let mut contents = Vec::new();

    // Read each .md file
    for entry in entries {
        let entry = entry.map_err(|e| format!("Failed to read directory entry: {}", e))?;
        let path = entry.path();

        // Skip if not a file
        if !path.is_file() {
            continue;
        }

        // Check if file ends with .md
        if let Some(extension) = path.extension() {
            if extension == "md" {
                // Read file content
                let content = fs::read_to_string(&path)
                    .map_err(|e| format!("Failed to read file {:?}: {}", path, e))?;
                contents.push(content);
            }
        }
    }

    Ok(contents)
}
