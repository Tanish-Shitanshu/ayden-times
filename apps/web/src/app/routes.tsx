import { lazy, Suspense, type ReactNode } from "react";
import { createBrowserRouter, createHashRouter, Outlet, useRouteError, type RouteObject } from "react-router";
import { Shell } from "./Shell";
import { Globals } from "./Globals";
import { SkeletonPage } from "../design/components";
import { ErrorBoundaryCard } from "../features/common/ErrorBoundary";
import { API_MODE } from "../api/client";

const Landing = lazy(() => import("../features/landing/Landing"));
const Demo = lazy(() => import("../features/landing/Demo"));
const Roles = lazy(() => import("../features/roles/Roles"));
const RoleDetail = lazy(() => import("../features/roles/RoleDetail"));
const Onboarding = lazy(() => import("../features/onboarding/Onboarding"));
const Workspace = lazy(() => import("../features/mission/Workspace"));
const Debrief = lazy(() => import("../features/debrief/Debrief"));
const Progress = lazy(() => import("../features/progress/Progress"));
const Cohort = lazy(() => import("../features/cohort/Cohort"));
const Join = lazy(() => import("../features/cohort/Join"));
const Privacy = lazy(() => import("../features/privacy/Privacy"));
const How = lazy(() => import("../features/how/How"));
const NotFound = lazy(() => import("../features/common/NotFound"));
const MockPanel = API_MODE === "mock" ? lazy(() => import("../features/common/MockPanel")) : null;

const page = (el: ReactNode) => <Suspense fallback={<div className="container page"><SkeletonPage /></div>}>{el}</Suspense>;

function Root() {
  return (
    <>
      <Outlet />
      <Globals />
      {MockPanel && <Suspense fallback={null}><MockPanel /></Suspense>}
    </>
  );
}

function RouteError() {
  const error = useRouteError();
  return <ErrorBoundaryCard error={error} />;
}

const routes: RouteObject[] = [
  {
    element: <Root />,
    errorElement: <RouteError />,
    children: [
      { path: "/mission/:missionId", element: <Suspense fallback={<div className="ws-loading" />}><Workspace /></Suspense>, errorElement: <RouteError /> },
      {
        element: <Shell />,
        errorElement: <RouteError />,
        children: [
          { path: "/", element: page(<Landing />) },
          { path: "/demo", element: page(<Demo />) },
          { path: "/roles", element: page(<Roles />) },
          { path: "/roles/:roleId", element: page(<RoleDetail />) },
          { path: "/onboarding/:roleId", element: page(<Onboarding />) },
          { path: "/mission/:missionId/debrief", element: page(<Debrief />) },
          { path: "/progress", element: page(<Progress />) },
          { path: "/progress/:roleId", element: page(<Progress />) },
          { path: "/cohort", element: page(<Cohort />) },
          { path: "/join/:code", element: page(<Join />) },
          { path: "/privacy", element: page(<Privacy />) },
          { path: "/how-it-works", element: page(<How />) },
          { path: "*", element: page(<NotFound />) },
        ],
      },
    ],
  },
];

export const router = import.meta.env.VITE_ROUTER === "hash" ? createHashRouter(routes) : createBrowserRouter(routes);
