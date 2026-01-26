import { useRef } from 'react';
import { Outlet, useNavigate } from 'react-router-dom';
import Breadcrumbs from '../components/ui/Breadcrumbs';

import FloatingNowPlaying from '../components/ui/FloatingNowPlaying';
import MobileNav from '../components/ui/MobileNav';
import { useGestures } from '../hooks/useGestures';
import { useAuth } from '../hooks/useAuth';
import { useSettings } from '../context/SettingsContext';
import { useAniListNotifications } from '../hooks/useAniListNotifications';

/**
 * MainLayout Component
 * 
 * Provides the persistent shell for the application.
 * Mobile-optimized version.
 */
function MainLayout() {
    const { user } = useAuth();
    const { unreadCount } = useAniListNotifications();

    // Gestures for Mobile Navigation
    const containerRef = useRef<HTMLDivElement>(null);
    const navigate = useNavigate();
    const { settings } = useSettings();

    // Helper to execute action
    const executeAction = (action: 'goBack' | 'goForward') => {
        if (action === 'goBack') navigate(-1);
        if (action === 'goForward') navigate(1);
    };

    useGestures(containerRef as React.RefObject<HTMLElement>, {
        onSwipeRight: () => {
            if (settings.gestures.goBack === 'swipeRight') executeAction('goBack');
            if (settings.gestures.goForward === 'swipeRight') executeAction('goForward');
        },
        onSwipeLeft: () => {
            if (settings.gestures.goBack === 'swipeLeft') executeAction('goBack');
            if (settings.gestures.goForward === 'swipeLeft') executeAction('goForward');
        },
        onTwoFingerTap: () => {
            // Future: toggle UI
        }
    });

    return (
        <div
            ref={containerRef}
            className="main-layout-container"
        >
            {/* Mobile Header Controls (Notifications & Settings) */}
            <div className="fixed top-14 right-4 pointer-events-auto z-50 flex items-center gap-3">
                {/* Notifications Icon */}
                {user?.name && (
                    <button
                        onClick={() => navigate('/notifications')}
                        className="p-2 bg-black/40 backdrop-blur-md rounded-full text-white/70 hover:text-white border border-white/10 relative"
                    >
                        <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                            <path d="M6 8a6 6 0 0 1 12 0c0 7 3 9 3 9H3s3-2 3-9"></path>
                            <path d="M10.3 21a1.94 1.94 0 0 0 3.4 0"></path>
                        </svg>
                        {/* Unread Badge */}
                        {unreadCount > 0 && (
                            <span className="absolute top-0 right-0 w-4 h-4 bg-[var(--color-zen-accent)] text-black text-[9px] font-bold flex items-center justify-center rounded-full border border-[#15151e]">
                                {unreadCount > 9 ? '9+' : unreadCount}
                            </span>
                        )}
                    </button>
                )}

                {/* Settings Icon */}
                <button
                    onClick={() => navigate('/settings')}
                    className="p-2 bg-black/40 backdrop-blur-md rounded-full text-white/70 hover:text-white border border-white/10"
                >
                    <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                        <path d="M12.22 2h-.44a2 2 0 0 0-2 2v.18a2 2 0 0 1-1 1.73l-.43.25a2 2 0 0 1-2 0l-.15-.08a2 2 0 0 0-2.73.73l-.22.38a2 2 0 0 0 .73 2.73l.15.1a2 2 0 0 1 1 1.72v.51a2 2 0 0 1-1 1.74l-.15.09a2 2 0 0 0-.73 2.73l.22.38a2 2 0 0 0 2.73.73l.15-.08a2 2 0 0 1 2 0l.43.25a2 2 0 0 1 1 1.73V20a2 2 0 0 0 2 2h.44a2 2 0 0 0 2-2v-.18a2 2 0 0 1 1-1.73l.43-.25a2 2 0 0 1 2 0l.15.08a2 2 0 0 0 2.73-.73l.22-.38a2 2 0 0 0-.73-2.73l-.15-.1a2 2 0 0 1-1-1.72v-.51a2 2 0 0 1 1-1.74l.15-.09a2 2 0 0 0 .73-2.73l-.22-.38a2 2 0 0 0-2.73-.73l-.15.08a2 2 0 0 1-2 0l-.43-.25a2 2 0 0 1-1-1.73V4a2 2 0 0 0-2-2z"></path>
                        <circle cx="12" cy="12" r="3"></circle>
                    </svg>
                </button>
            </div>

            {/* Main Content Area - Styled as a contained "Canvas" */}
            <div className="main-content-area">
                {/* Page Content Outlet */}
                <div className="relative flex-1 flex flex-col overflow-hidden">
                    {/* Header Controls Row - Floating Overlay */}
                    <div className="header-controls flex-col items-start gap-2 pt-2">


                        {/* Mobile Profile Icon (Top Left) */}
                        {user?.name && (
                            <div className="absolute top-4 left-4 pointer-events-auto z-50">
                                <button
                                    onClick={() => navigate(`/user/${user.name}`)}
                                    className="w-8 h-8 flex items-center justify-center bg-black/40 backdrop-blur-md rounded-full text-white/70 hover:text-white border border-white/10 overflow-hidden padding-0"
                                >
                                    {user.avatar?.medium ? (
                                        <img src={user.avatar.medium} alt={user.name} className="w-full h-full object-cover" />
                                    ) : (
                                        <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                                            <path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"></path>
                                            <circle cx="12" cy="7" r="4"></circle>
                                        </svg>
                                    )}
                                </button>
                            </div>
                        )}
                    </div>

                    {/* Scrollable Content Container */}
                    <div id="main-scroll-container" className="content-scroll-container no-scrollbar">
                        <Outlet />
                    </div>
                </div>
            </div>

            {/* Mobile Navigation - Always Visible */}
            <MobileNav />

            {/* Floating Now Playing Pill - Global overlay */}
            <FloatingNowPlaying />
        </div>
    );
}

export default MainLayout;
