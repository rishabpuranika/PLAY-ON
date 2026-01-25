import { useState, useEffect, useCallback } from 'react';
import { Outlet } from 'react-router-dom';
import Sidebar from '../components/sidebar/Sidebar';
import Titlebar from '../components/titlebar/Titlebar';
import TabNavigation from '../components/ui/TabNavigation';
import SearchBar from '../components/ui/SearchBar';
import Breadcrumbs from '../components/ui/Breadcrumbs';

import FloatingNowPlaying from '../components/ui/FloatingNowPlaying';
import MobileNav from '../components/ui/MobileNav'; // Import MobileNav
import { useKeyboardShortcuts } from '../hooks/useKeyboardShortcuts';
import { useSearchBar } from '../context/SearchBarContext';
import { useAuth } from '../hooks/useAuth';

/**
 * MainLayout Component
 * 
 * Provides the persistent shell for the application.
 */
function MainLayout() {
    const [sidebarWidth, setSidebarWidth] = useState(200);
    const [isResizing, setIsResizing] = useState(false);
    const { user } = useAuth();
    const [isMobile, setIsMobile] = useState(window.innerWidth <= 768);

    // Track window size for mobile logic if needed in JS (though CSS handles most)
    useEffect(() => {
        const handleResize = () => {
            setIsMobile(window.innerWidth <= 768);
        };
        window.addEventListener('resize', handleResize);
        return () => window.removeEventListener('resize', handleResize);
    }, []);

    // Dynamically adjust sidebar width for long usernames
    useEffect(() => {
        if (user?.name && !isMobile) {
            // Approx 10px per character + 110px base (48px avatar + margins/padding)
            // "MemestaVedas" (12 chars) -> 120 + 110 = 230px
            const nameWidth = user.name.length * 10;
            const requiredWidth = 110 + nameWidth;

            // Only auto-expand if current width is too small
            // And limit max auto-expansion to 300px to avoid taking too much space
            if (sidebarWidth < requiredWidth) {
                const newWidth = Math.min(requiredWidth, 300);
                // Ensure we don't shrink below 200 default
                setSidebarWidth(Math.max(200, newWidth));
            }
        }
    }, [user?.name, isMobile, sidebarWidth]); // Check when username changes (e.g. login)

    // Keyboard Shortcuts
    const { focusSearch } = useSearchBar();
    useKeyboardShortcuts({
        onSearchAnime: () => focusSearch('anime'),
        onSearchManga: () => focusSearch('manga'),
    });

    const handleBack = () => {
        window.history.back();
    };

    const handleForward = () => {
        window.history.forward();
    };

    const startResizing = useCallback(() => {
        setIsResizing(true);
    }, []);

    const stopResizing = useCallback(() => {
        setIsResizing(false);
    }, []);

    const resize = useCallback((mouseMoveEvent: MouseEvent) => {
        if (isResizing) {
            const newWidth = mouseMoveEvent.clientX;
            if (newWidth >= 180 && newWidth <= 450) {
                setSidebarWidth(newWidth);
            }
        }
    }, [isResizing]);

    useEffect(() => {
        window.addEventListener("mousemove", resize);
        window.addEventListener("mouseup", stopResizing);
        return () => {
            window.removeEventListener("mousemove", resize);
            window.removeEventListener("mouseup", stopResizing);
        };
    }, [resize, stopResizing]);

    return (
        <div
            className="main-layout-container"
            style={{ userSelect: isResizing ? 'none' : 'auto' }}
        >
            {/* Custom Titlebar - Desktop Only */}
            {!isMobile && <Titlebar />}

            {/* Sidebar - Hidden on Mobile via CSS */}
            <div
                className="sidebar-wrapper"
                style={{ width: `${sidebarWidth}px` }}
            >
                <Sidebar width={sidebarWidth} />

                {/* Resize Handle */}
                <div
                    onMouseDown={startResizing}
                    className={`resize-handle ${isResizing ? 'resizing' : ''}`}
                    onMouseEnter={(e) => {
                        if (!isResizing) e.currentTarget.style.background = 'rgba(255, 255, 255, 0.05)';
                    }}
                    onMouseLeave={(e) => {
                        if (!isResizing) e.currentTarget.style.background = 'transparent';
                    }}
                />
            </div>

            {/* Main Content Area - Styled as a contained "Canvas" */}
            <div className="main-content-area">
                {/* Page Content Outlet */}
                <div className="relative flex-1 flex flex-col overflow-hidden">
                    {/* Header Controls Row - Floating Overlay */}
                    <div className={`header-controls ${isMobile ? 'flex-col items-start gap-2 pt-2' : ''}`}>
                        {!isMobile && (
                            <div className="pointer-events-auto"><TabNavigation onBack={handleBack} onForward={handleForward} /></div>
                        )}

                        {/* Always show Breadcrumbs (User request: "add home displayed on top") */}
                        <div className={`pointer-events-auto ${isMobile ? 'pl-4' : ''}`}><Breadcrumbs /></div>
                    </div>

                    {/* Scrollable Content Container */}
                    <div id="main-scroll-container" className="content-scroll-container no-scrollbar">
                        <Outlet />
                    </div>
                </div>
            </div>

            {/* Mobile Navigation - Only visible on mobile via CSS/JS logic */}
            {isMobile && <MobileNav />}

            {/* Floating Now Playing Pill - Global overlay */}
            <FloatingNowPlaying />
        </div>
    );
}

export default MainLayout;
