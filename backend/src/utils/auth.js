const cryptoUtils = require('./crypto');

/**
 * Compatibility shim for tests expecting `generateJWT`
 */
const generateJWT = (payload, expiresIn) => {
  return cryptoUtils.generateToken(payload, expiresIn);
};

const generateRefreshJWT = (payload) => {
  return cryptoUtils.generateRefreshToken(payload);
};

const verifyJWT = (token) => {
  return cryptoUtils.verifyToken(token);
};

module.exports = {
  generateJWT,
  generateRefreshJWT,
  verifyJWT,
};
