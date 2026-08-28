export const checkCronAuth = (req, res, next) => {
  if (req.headers["x-cron-secret"] !== process.env.CRON_SECRET) {
    return res.status(403).json({ error: "Unauthorized" });
  }
  next();
};
