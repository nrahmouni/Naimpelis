import { getApps, initializeApp } from 'firebase-admin/app';
import { getAuth } from 'firebase-admin/auth';
import firebaseConfig from '../../firebase-applet-config.json' with { type: 'json' };

const app =
  getApps()[0] ||
  initializeApp({
    projectId: firebaseConfig.projectId,
  });

export const firebaseAdminAuth = getAuth(app);
