import { open } from '@tauri-apps/plugin-dialog';

export async function pickDirectory(title?: string): Promise<string | null> {
    const isMobile = /Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(navigator.userAgent);

    if (isMobile) {
        return new Promise<string | null>((resolve) => {
            // Explain the limitation first
            alert("Mobile Restriction: Please select any FILE inside the folder you want to use. We will create the library there.");

            const input = document.createElement('input');
            input.type = 'file';
            input.style.display = 'none';
            document.body.appendChild(input);

            input.onchange = (e: any) => {
                const files = e.target.files;
                if (files && files.length > 0) {
                    const firstFile = files[0];
                    // Try to get path from Tauri's extended File object
                    const filePath = (firstFile as any).path;

                    if (filePath) {
                        const separator = filePath.includes('\\') ? '\\' : '/';
                        const dirPath = filePath.substring(0, filePath.lastIndexOf(separator));
                        resolve(dirPath);
                    } else {
                        alert("Could not resolve real path. Ensure you grant storage permissions.");
                        resolve(null);
                    }
                } else {
                    resolve(null);
                }
                cleanup();
            };

            input.oncancel = () => {
                resolve(null);
                cleanup();
            };

            const cleanup = () => {
                if (document.body.contains(input)) {
                    document.body.removeChild(input);
                }
            };

            input.click();
        });
    } else {
        // Desktop: use native dialog
        try {
            const result = await open({
                directory: true,
                multiple: false,
                recursive: true,
                title: title || 'Select a folder'
            });
            return result as string | null;
        } catch (err) {
            console.error("Failed to open dialog", err);
            return null;
        }
    }
}
