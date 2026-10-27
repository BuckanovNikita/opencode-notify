exports.activate = context => {
  if (process.env.OPENCODE_NOTIFY_PEER_SMOKE_DIR) return require('../../dist/peer-window.cjs').activate(context);
};
