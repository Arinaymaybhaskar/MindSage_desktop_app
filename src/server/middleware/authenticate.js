import jwt from "jsonwebtoken";

function authenticateToken(req, res, next) {
  const authHeader = req.headers['authorization'];
  const token = authHeader && authHeader.split(' ')[1];
  if (token == null) return res.status(401).send("Unauthorized");

  const offlineAccessTokenSecret = "be1e968105e3d8c510625e7ae117d3b376913c6359b5063bc5ff07f1cc43cfa3229405930cdeb7bcc9e9ebf3199c0b85b1a0c2396018eee4985f2d1a0abf6002";

  jwt.verify(token, offlineAccessTokenSecret, (err, user) => {
    if (err) return res.status(403).send("Forbidden");
    req.user = user;
    next();
  });
}

export default authenticateToken;
