/*
 * core/app.js - entry module (the only <script> in index.html).
 *
 * Boots core services: rights gate and data store, in parallel. Sets
 * <html data-state="ready|error"> so tests and later modules can wait for boot.
 * Later milestones add the scene, light rig, guitar and modals here, in that order.
 *
 * Must not change: it is the single entry point; keep its static import graph small
 * (check:budgets counts it against the 90 KB initial-JS budget).
 */

import { RightsGate } from './rights.js';
import { DataStore } from './data-store.js';

const root = document.documentElement;

try {
  await Promise.all([RightsGate.load(), DataStore.load()]);
  root.dataset.state = 'ready';
} catch (err) {
  root.dataset.state = 'error';
  console.error(err);
}
