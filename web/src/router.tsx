import { lazy } from "react";
import { createBrowserRouter, Outlet } from "react-router-dom";

import { AnalyticsTracker } from "@/components/layout/analytics-tracker";
import { RequireUser } from "@/components/layout/require-user";
const StoriesPage = lazy(() => import("@/features/stories"));
const UserLayout = lazy(() => import("@/layouts/user-layout"));
const AssetsPage = lazy(() => import("@/pages/assets"));
const CanvasPage = lazy(() => import("@/pages/canvas"));
const CanvasProjectPage = lazy(() => import("@/pages/canvas/project"));
const ConfigPage = lazy(() => import("@/pages/config"));
const HomePage = lazy(() => import("@/pages/home"));
const ImagePage = lazy(() => import("@/pages/image"));
const NotFound = lazy(() => import("@/pages/not-found"));
const PromptsPage = lazy(() => import("@/pages/prompts"));
const VideoPage = lazy(() => import("@/pages/video"));
const PricingPage = lazy(() => import("@/pages/pricing"));
const AccountPage = lazy(() => import("@/pages/account"));
const LoginPage = lazy(() => import("@/pages/login"));
const RecoveryPage = lazy(() => import("@/pages/login/recovery"));
const LegalPage = lazy(() => import("@/pages/legal"));

export const router = createBrowserRouter([
    {
        element: (
            <UserLayout>
                <AnalyticsTracker />
                <Outlet />
            </UserLayout>
        ),
        children: [
            { path: "/", element: <HomePage /> },
            { path: "/prompts", element: <PromptsPage /> },
            {
                element: <RequireUser />,
                children: [
                    { path: "/image", element: <ImagePage /> },
                    { path: "/video", element: <VideoPage /> },
                    { path: "/assets", element: <AssetsPage /> },
                    { path: "/canvas", element: <CanvasPage /> },
                    { path: "/stories", element: <StoriesPage /> },
                    { path: "/canvas/:id", element: <CanvasProjectPage /> },
                    { path: "/pricing", element: <PricingPage /> },
                    { path: "/account", element: <AccountPage /> },
                    // Original payment callbacks return to these paths on the public site.
                    { path: "/wallet", element: <AccountPage initialTab="wallet" /> },
                    { path: "/usage-logs", element: <AccountPage initialTab="wallet" /> },
                    { path: "/config", element: <ConfigPage /> },
                ],
            },
        ],
    },
    { path: "/login", element: <LoginPage key="login" /> },
    { path: "/register", element: <LoginPage key="register" /> },
    { path: "/forgot-password", element: <RecoveryPage key="forgot" /> },
    { path: "/user/reset", element: <RecoveryPage key="reset" resetting /> },
    { path: "/terms-of-service", element: <LegalPage /> },
    { path: "/privacy-policy", element: <LegalPage /> },
    { path: "*", element: <NotFound /> },
]);
