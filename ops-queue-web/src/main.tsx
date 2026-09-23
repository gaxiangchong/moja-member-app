import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { App } from './App';
import { KitchenWindowApp } from './KitchenWindowApp';
import { MemberWindowApp } from './MemberWindowApp';
import { ScanWindowApp } from './ScanWindowApp';
import { TimesheetWindowApp } from './TimesheetWindowApp';
import './App.css';

const root = document.getElementById('root')!;
const hash = window.location.hash;
const isScanOnly = hash === '#/scan';
const isTimesheetOnly = hash === '#/timesheet';
const isKitchenOnly = hash === '#/kitchen';
const isMemberOnly = hash === '#/member';

createRoot(root).render(
  <StrictMode>
    {isScanOnly ? (
      <ScanWindowApp />
    ) : isTimesheetOnly ? (
      <TimesheetWindowApp />
    ) : isKitchenOnly ? (
      <KitchenWindowApp />
    ) : isMemberOnly ? (
      <MemberWindowApp />
    ) : (
      <App />
    )}
  </StrictMode>,
);
