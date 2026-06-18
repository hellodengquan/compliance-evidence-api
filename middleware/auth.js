function requireAuth(req, res, next) {
  if (!req.session || !req.session.user) {
    return res.status(401).json({ error: '未登录，请先登录' });
  }
  req.currentUser = req.session.user;
  next();
}

function requireReviewerOrAdmin(req, res, next) {
  if (!req.session || !req.session.user) {
    return res.status(401).json({ error: '未登录，请先登录' });
  }
  req.currentUser = req.session.user;
  next();
}

module.exports = { requireAuth, requireReviewerOrAdmin };
