import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { useEffect, useState } from 'react';
import Onboarding from './pages/Onboarding';
import Home from './pages/Home';
import UnifiedList from './pages/UnifiedList';
import AnimeList from './pages/AnimeList';
import AnimeHub from './pages/AnimeHub';
import MangaList from './pages/MangaList';
import LocalAnimeList from './pages/LocalAnimeList';
import LocalMangaList from './pages/LocalMangaList';
import MangaHub from './pages/MangaHub';
import MangaSourceDetails from './pages/MangaSourceDetails';
import MangaReader from './pages/MangaReader';
import LocalFileReader from './pages/LocalFileReader';
import History from './pages/History';
import Notifications from './pages/Notifications';
import Community from './pages/Community';
import Statistics from './pages/Statistics';
import AnimeDetails from './pages/AnimeDetails';
import MangaDetails from './pages/MangaDetails';
import CounterDemo from './pages/CounterDemo';
import AnimeWatch from './pages/AnimeWatch';
import AnimeSourceDetails from './pages/AnimeSourceDetails';
import WebBrowser from './pages/WebBrowser';
import MainLayout from './layouts/MainLayout';
import { AuthProvider } from './context/AuthContext';
import { LocalMediaProvider } from './context/LocalMediaContext';
import { NowPlayingProvider } from './context/NowPlayingContext';
import { SettingsProvider, useSettings } from './context/SettingsContext';
import { SearchBarProvider } from './context/SearchBarContext';
import { ThemeProvider } from './context/ThemeContext';
import { ToastProvider } from './context/ToastContext';
import { ToastContainer } from './components/ui/Toast';
import { OfflineIndicator } from './components/ui/OfflineIndicator';
import ErrorBoundary from './components/ErrorBoundary';
import LocalFolder from './pages/LocalFolder';
import Settings from './pages/Settings';

import UserProfile from './pages/UserProfile';
import Calendar from './pages/Calendar';
import { CursorSpotlight } from './components/ui/CursorSpotlight';
import { DynamicThemeProvider } from './context/DynamicThemeContext';
import { NotificationProvider } from './context/NotificationContext';
import { LibrarySettingsProvider } from './context/LibrarySettingsContext';
import "./App.css";

import { useOfflineSync } from './lib/offlineQueue';
import { useAutoSync } from './hooks/useAutoSync';

import { ApolloProvider } from '@apollo/client';
import { apolloClient } from './lib/apollo';
import { checkAndRefreshCache } from './lib/cacheRefresh';
import SplashScreen from './components/ui/SplashScreen';
import { ExtensionManager } from './services/ExtensionManager';
import { AnimeExtensionManager } from './services/AnimeExtensionManager';

/**
 * ProtectedRoute Component
 */
function ProtectedRoute() {
  const [isChecking, setIsChecking] = useState(true);
  const [hasCompletedOnboarding, setHasCompletedOnboarding] = useState(false);
  const { settings } = useSettings();

  useEffect(() => {
    // Check if user has completed onboarding
    const completed = localStorage.getItem('onboardingCompleted');
    setHasCompletedOnboarding(completed === 'true');
    setIsChecking(false);
  }, []);

  // Show loading while checking (prevents flash of wrong page)
  if (isChecking) {
    return <div>Loading...</div>;
  }

  // If onboarding completed, redirect to configured default page
  if (hasCompletedOnboarding) {
    const targetPath = `/${settings.defaultPage}`;
    return <Navigate to={targetPath} replace />;
  }

  // Otherwise, show onboarding
  return <Onboarding />;
}

function AppContent() {
  // Detect mobile environment to disable heavy splash screen
  // const isMobile = /Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(navigator.userAgent);
  const [showSplash, setShowSplash] = useState(true);

  // These hooks consume contexts provided by AppWrapper
  useOfflineSync();
  useAutoSync();

  // Startup cache refresh (v0.3.0) and extension initialization
  useEffect(() => {
    console.log('=== APP INITIALIZATION STARTING ===');

    // Initialize extension manager (loads installed extensions from storage)
    ExtensionManager.initialize().then(() => {
      console.log('[App] Manga extension manager initialized');
      console.log('[App] Manga sources available:', ExtensionManager.getAllSources().length);
      ExtensionManager.getAllSources().forEach(s => {
        console.log(`[App]   - ${s.name} (${s.id})`);
      });
    }).catch(err => {
      console.error('[App] Failed to initialize manga extensions:', err);
    });

    // Initialize anime extension manager
    AnimeExtensionManager.initialize().then(() => {
      console.log('[App] Anime extension manager initialized');
      console.log('[App] Anime sources available:', AnimeExtensionManager.getAllSources().length);
      AnimeExtensionManager.getAllSources().forEach(s => {
        console.log(`[App]   - ${s.name} (${s.id})`);
      });
    }).catch(err => {
      console.error('[App] Failed to initialize anime extensions:', err);
    });

    // Check if cache needs refresh (6 hour interval)
    checkAndRefreshCache().then((refreshed) => {
      if (refreshed) {
        console.log('[App] Cache was refreshed on startup');
      }
    });

  }, []);

  useEffect(() => {
    // DEV: Clear onboarding status to force onboarding every time
    // Remove this line when ready for production!
    // localStorage.removeItem('onboardingCompleted');
    // localStorage.removeItem('username'); // Commented out to persist login for now
  }, []);

  return (
    <>
      {/* Splash Screen - shows on startup */}
      {showSplash && (
        <SplashScreen onComplete={() => setShowSplash(false)} minDuration={2000} />
      )}

      <CursorSpotlight />

      <BrowserRouter>
        <Routes>
          {/* Root route - checks if onboarding needed */}
          <Route path="/" element={<ProtectedRoute />} />

          {/* Full-screen Manga Reader (outside MainLayout) */}
          <Route path="/read/:sourceId/:chapterId" element={<MangaReader />} />

          {/* Full-screen Local File Reader (outside MainLayout) */}
          <Route path="/read-local" element={<LocalFileReader />} />

          {/* Main App Layout */}
          <Route element={<MainLayout />}>
            <Route path="/home" element={<Home />} />
            <Route path="/my-list" element={<UnifiedList />} />
            <Route path="/calendar" element={<Calendar />} />
            <Route path="/anime-list" element={<AnimeList />} />
            <Route path="/anime-browse" element={<AnimeHub />} />
            <Route path="/manga-list" element={<MangaList />} />
            <Route path="/local-anime" element={<LocalAnimeList />} />
            <Route path="/local-manga" element={<LocalMangaList />} />
            <Route path="/history" element={<History />} />
            <Route path="/notifications" element={<Notifications />} />
            <Route path="/community" element={<Community />} />
            <Route path="/statistics" element={<Statistics />} />

            {/* Dynamic route for anime details */}
            <Route path="/anime/:id" element={<AnimeDetails />} />
            {/* Dynamic route for manga details */}
            <Route path="/manga-details/:id" element={<MangaDetails />} />
            <Route path="/counter-demo" element={<CounterDemo />} />

            {/* Settings Route */}
            <Route path="/settings" element={<Settings />} />
            <Route path="/user/:username" element={<UserProfile />} />

            {/* Local Folder Route */}
            <Route path="/local/:folderPath" element={<LocalFolder />} />

            {/* Anime Source Routes */}
            <Route path="/anime-source/:sourceId/:animeId" element={<AnimeSourceDetails />} />

            {/* Manga Source Routes */}
            <Route path="/manga-browse" element={<MangaHub />} />
            <Route path="/manga/:sourceId/:mangaId" element={<MangaSourceDetails />} />
          </Route>

          {/* Full-screen Anime Watch (outside MainLayout) */}
          <Route path="/watch/:sourceId/:episodeId" element={<AnimeWatch />} />

          {/* Full-screen Web Browser for Anime (outside MainLayout) */}
          <Route path="/browser" element={<WebBrowser />} />
        </Routes>
      </BrowserRouter>
    </>
  );
}

function App() {
  return (
    <ErrorBoundary>
      <ApolloProvider client={apolloClient}>
        <ToastProvider>
          <ThemeProvider>
            <SettingsProvider>
              <LibrarySettingsProvider>
                <AuthProvider>
                  <NotificationProvider>
                    <LocalMediaProvider>
                      <NowPlayingProvider>
                        <SearchBarProvider>
                          <DynamicThemeProvider>
                            <AppContent />
                          </DynamicThemeProvider>
                        </SearchBarProvider>
                      </NowPlayingProvider>
                    </LocalMediaProvider>
                  </NotificationProvider>
                </AuthProvider>
              </LibrarySettingsProvider>
            </SettingsProvider>
          </ThemeProvider>
          <ToastContainer />
          <OfflineIndicator />
        </ToastProvider>
      </ApolloProvider>
    </ErrorBoundary>
  );
}

export default App;
