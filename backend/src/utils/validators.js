const Joi = require('joi');

const validators = {
  /**
   * Validate user registration
   */
  validateRegister: (data) => {
    const schema = Joi.object({
      username: Joi.string()
        .alphanum()
        .min(3)
        .max(30)
        .required(),
      email: Joi.string()
        .email()
        .required(),
      password: Joi.string()
        .min(8)
        .pattern(/^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)/)
        .required()
        .messages({
          'string.pattern.base': 'Password must contain at least one uppercase letter, one lowercase letter, and one number',
        }),
      confirmPassword: Joi.string()
        .valid(Joi.ref('password'))
        .required()
        .messages({
          'any.only': 'Passwords do not match',
        }),
    });
    return schema.validate(data);
  },

  /**
   * Validate user login
   */
  validateLogin: (data) => {
    const schema = Joi.object({
      email: Joi.string()
        .email()
        .required(),
      password: Joi.string()
        .required(),
    });
    return schema.validate(data);
  },

  /**
   * Validate table creation
   */
  validateTableCreation: (data) => {
    const schema = Joi.object({
      name: Joi.string()
        .max(255)
        .required(),
      smallBlind: Joi.number()
        .positive()
        .required(),
      bigBlind: Joi.number()
        .positive()
        .greater(Joi.ref('smallBlind'))
        .required(),
      minBuyIn: Joi.number()
        .positive()
        .required(),
      maxBuyIn: Joi.number()
        .positive()
        .greater(Joi.ref('minBuyIn'))
        .required(),
      maxSeats: Joi.number()
        .integer()
        .min(2)
        .max(10)
        .default(6),
    });
    return schema.validate(data);
  },

  /**
   * Validate player action
   */
  validatePlayerAction: (data) => {
    const schema = Joi.object({
      tableId: Joi.string()
        .uuid()
        .required(),
      action: Joi.string()
        .valid('fold', 'check', 'call', 'raise', 'all_in')
        .required(),
      amount: Joi.number()
        .non-negative()
        .when('action', {
          is: Joi.string().valid('raise', 'all_in'),
          then: Joi.required(),
          otherwise: Joi.optional(),
        }),
    });
    return schema.validate(data);
  },

  /**
   * Validate refresh token
   */
  validateRefreshToken: (data) => {
    const schema = Joi.object({
      refreshToken: Joi.string()
        .required(),
    });
    return schema.validate(data);
  },
};

module.exports = validators;
