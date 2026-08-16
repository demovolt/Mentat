'use strict';

const { app } = require('electron');
const path = require('path');
const fs = require('fs');
const { log } = require('./logger');

const configFile = path.join(app.getPath('userData'), 'config.json');
const stateFile = path.join(app.getPath('userData'), 'state.json');

function loadConfig() {
  try {
    const raw = JSON.parse(fs.readFileSync(configFile, 'utf8'));
    if (!raw.workspace && raw.repoPath) raw.workspace = [{ path: raw.repoPath }];
    if (!raw.workspace) raw.workspace = [];
    if (!raw.aiCommand) raw.aiCommand = 'claude';
    return raw;
  } catch (e) {
    log('WARN', 'Config load failed (using defaults):', e.message);
    return { workspace: [], aiCommand: 'claude' };
  }
}

function saveConfig(cfg) {
  fs.mkdirSync(path.dirname(configFile), { recursive: true });
  fs.writeFileSync(configFile, JSON.stringify(cfg, null, 2));
  log('INFO', 'Config saved');
}

function loadState() {
  try { return JSON.parse(fs.readFileSync(stateFile, 'utf8')); }
  catch { return null; }
}

function saveState(state) {
  fs.writeFileSync(stateFile, JSON.stringify(state, null, 2));
}

module.exports = { loadConfig, saveConfig, loadState, saveState };
