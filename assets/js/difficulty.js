/* DataLab — learning modes. One setting changes how much the game holds the player's hand and how much
   it pays: Iniciante (maximum help, smaller rewards), Intermediário (moderate help) and Experiente
   (little help, bigger challenges, easier money). Everyone can still ask for help — only the amount of
   assistance changes. Every system reads the numbers from DL.mode(), so tuning lives here. */
(function () {
  'use strict';
  const DL = window.DL;
  const KEY = 'datalab.mode.v1';

  DL.MODES = {
    iniciante: {
      id: 'iniciante', name: 'Iniciante', short: 'INI', color: '#7ee0a1',
      desc: 'Ajuda máxima: passo a passo, dicas de comando e erros explicados.', tag: 'Recompensa menor',
      reward: 0.7,          // credits and company revenue
      incidentGap: 1.5,     // × the time between incidents (more calm)
      crewGrace: 30,        // seconds before the crew takes a found fault on its own
      autoHelp: true,       // the terminal opens the help card by itself
      helpAfter: 1,         // misses before the terminal suggests the help
      stepText: 'full',     // every step visible, with the command hint
      helpDepth: 'full',    // command, example, what it does and when to use it
      explainErrors: true,  // terminal errors come with an explanation
      crewHints: 'exact',   // what the crew says about problems: exact commands
      tips: true,           // explanatory toasts on new problems
    },
    intermediario: {
      id: 'intermediario', name: 'Intermediário', short: 'INT', color: '#a0c3ec',
      desc: 'Ajuda moderada: passos visíveis, dicas só quando você pede.', tag: 'Recompensa média',
      reward: 1, incidentGap: 1, crewGrace: 45, autoHelp: false, helpAfter: 3, stepText: 'full', helpDepth: 'example',
      explainErrors: false, crewHints: 'exact', tips: false,
    },
    experiente: {
      id: 'experiente', name: 'Experiente', short: 'EXP', color: '#ff7a17',
      desc: 'Pouca ajuda: só o objetivo, passos revelados ao concluir. Desafios maiores.', tag: 'Recompensa maior',
      reward: 1.35, incidentGap: 0.85, crewGrace: 75, autoHelp: false, helpAfter: 0, stepText: 'hidden', helpDepth: 'syntax',
      explainErrors: false, crewHints: 'vague', tips: false,
    },
  };
  DL.MODE_ORDER = ['iniciante', 'intermediario', 'experiente'];

  let current = 'intermediario';
  try { const v = localStorage.getItem(KEY); if (v && DL.MODES[v]) current = v; } catch (e) { /* private mode */ }
  const listeners = [];

  DL.learn = () => DL.MODES[current];
  DL.setLearn = function (id) {
    if (!DL.MODES[id] || id === current) return;
    current = id;
    try { localStorage.setItem(KEY, id); } catch (e) { /* private mode */ }
    listeners.forEach((fn) => fn(DL.MODES[id]));
  };
  DL.onLearnChange = (fn) => listeners.push(fn);
})();
