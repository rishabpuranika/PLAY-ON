import { useState, useEffect } from 'react';
import { invoke } from '@tauri-apps/api/core';
import { useToast } from '../context/ToastContext';
import { useSettings } from '../context/SettingsContext';

export function StoragePermissionPopup() {
    const [showPopup, setShowPopup] = useState(false);
    const [isLoading, setIsLoading] = useState(true);

    const { toast } = useToast();
    const { updateSetting } = useSettings();

    const checkStorage = async () => {
        try {
            const location = await invoke<string | null>('get_download_location');
            // If no location is set, show the popup
            if (!location) {
                setShowPopup(true);
                // toast.info("Storage permission required for downloads", 5000);
            } else {
                setShowPopup(false);
            }
        } catch (err) {
            console.error('Failed to check download location:', err);
        } finally {
            setIsLoading(false);
        }
    };

    useEffect(() => {
        checkStorage();
    }, []);

    const handleGrantPermission = async () => {
        try {
            toast.info("Please select a folder for downloads");
            const selected = await invoke<string>('pick_download_directory');
            if (selected) {
                updateSetting('mangaDownloadPath', selected);
                setShowPopup(false);
                toast.success("Storage permission granted!");
            }
        } catch (err) {
            console.error('Failed to pick directory:', err);
            // toast.error("Failed to select storage location");
        }
    };

    if (isLoading || !showPopup) return null;

    return (
        <div className="fixed inset-0 z-[9999] flex items-center justify-center bg-black/80 backdrop-blur-sm p-4">
            <div className="bg-gray-900 border border-gray-700 rounded-xl max-w-md w-full p-6 shadow-2xl relative animate-in fade-in zoom-in duration-300">
                <div className="text-center">
                    <div className="w-16 h-16 bg-blue-500/20 rounded-full flex items-center justify-center mx-auto mb-4">
                        <svg
                            xmlns="http://www.w3.org/2000/svg"
                            className="w-8 h-8 text-blue-400"
                            viewBox="0 0 24 24"
                            fill="none"
                            stroke="currentColor"
                            strokeWidth="2"
                            strokeLinecap="round"
                            strokeLinejoin="round"
                        >
                            <path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z"></path>
                        </svg>
                    </div>

                    <h2 className="text-xl font-bold text-white mb-2">Storage Permission Required</h2>

                    <p className="text-gray-300 mb-6 leading-relaxed">
                        To download anime and manga, PLAY-ON needs access to a storage folder.
                        Please select a folder where you want to store your downloads.
                    </p>

                    <div className="space-y-3">
                        <button
                            onClick={handleGrantPermission}
                            className="w-full py-3 px-4 bg-blue-600 hover:bg-blue-500 text-white rounded-lg font-medium transition-colors flex items-center justify-center gap-2"
                        >
                            <svg xmlns="http://www.w3.org/2000/svg" className="w-5 h-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                                <path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z"></path>
                                <line x1="12" y1="11" x2="12" y2="17"></line>
                                <line x1="9" y1="14" x2="15" y2="14"></line>
                            </svg>
                            Select Download Folder
                        </button>

                        <p className="text-xs text-center text-gray-500 mt-4">
                            This will grant PLAY-ON specific access to read and write files in the selected folder.
                        </p>
                    </div>
                </div>
            </div>
        </div>
    );
}
