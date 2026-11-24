const jwt = require("jsonwebtoken");
const prisma = require("./db");
const { AppError } = require("./errors");

function requireAuth(req, _res, next) {
  const token = req.get("authorization")?.replace(/^Bearer\s+/i, "");
  if (!token) return next(new AppError(401, "Sign in to continue."));
  try {
    const claims = jwt.verify(token, process.env.JWT_SECRET);
    req.auth = { id: claims.sub, role: claims.role, name: claims.name };
    return next();
  } catch {
    return next(new AppError(401, "Your session has expired. Sign in again."));
  }
}

function allowRoles(...roles) {
  return (req, _res, next) => {
    if (!roles.includes(req.auth?.role)) return next(new AppError(403, "You do not have permission to perform this action."));
    next();
  };
}

async function writeAudit(tx, req, action, entityType, entityId, details) {
  await tx.auditLog.create({
    data: {
      userId: req.auth.id,
      action,
      entityType,
      entityId,
      details,
    },
  });
}

module.exports = { allowRoles, requireAuth, writeAudit };
