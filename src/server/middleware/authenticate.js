import jwt from "jsonwebtoken";

function authenticateToken(req, res, next) {
  const authHeader = req.headers['authorization'];
  const token = authHeader && authHeader.split(' ')[1];
  if (token == null) return res.status(401).send("Unauthorized");

  const accessTokenSecret = process.env.ACCESS_TOKEN_SECRET;
  if (!accessTokenSecret) {
    console.error("ACCESS_TOKEN_SECRET is not set");
    return res.status(500).send("Server misconfiguration");
  }

  jwt.verify(token, accessTokenSecret, (err, user) => {
    if (err) return res.status(403).send("Forbidden");
    req.user = user;
    next();
  });
}

export default authenticateToken;
