'use strict';

const terminalStatuses = new Map();
const terminalSessionActive = new Map();
const terminalSessionIds = new Map();
const terminalAgents = new Map();    // Map<termId, Map<agentId, { description }>>
const terminalProcesses = new Map(); // Map<termId, Map<processId, { command }>>

module.exports = { terminalStatuses, terminalSessionActive, terminalSessionIds, terminalAgents, terminalProcesses };
