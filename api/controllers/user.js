// Used for proper documantation
// eslint-disable-next-line no-unused-vars
const express = require('express');

const validator = require('validator');
const utils = require('../../lib/utils');
const startCase = require('lodash/startCase');

class UserController {
  constructor(model) {
    this.userModel = model;
  }

  /**
   * User registration function.
   * @param {express.request} req incoming request
   * @param {express.response} res response object
   */
  userRegistration(req, res) {
    const errors = utils.checkRequired(req.body, [
      'email',
      'password',
      'lastName',
      'firstName',
      'phoneNumber',
      'terms',
    ]);
    errors.push(...validate(req.body));

    if (errors.length != 0) {
      errorResponse(res, errors.join('\n'), {clientShowMessage: true});
      return;
    }

    req.body.phoneNumber = filterPhoneNumber(req.body.phoneNumber);

    const usersObj = {...req.body};
    delete usersObj.terms;

    usersObj.password = utils.encodePasswordForDb(usersObj.password);

    if (req.body.type) {
      usersObj.type = req.body.type;
    } else {
      usersObj.type = 5;
    }

    this.userModel.userRegistration(usersObj, res);
  }

  /**
   * Save question for user.
   * @param {express.request} req incoming request
   * @param {express.response} res response object
   */
  userQuestion(req, res) {
    const errors = utils.checkRequired(req.body, ['email', 'question', 'name']);
    errors.push(...validate(req.body));

    if (errors.length != 0) {
      errorResponse(res, errors.join('\n'), {clientShowMessage: true});
      return;
    }

    this.userModel.userQuestion(
        {
          name: req.body.name,
          email: req.body.email,
          question: req.body.question,
        },
        res);
  }

  /**
   * Get user profile.
   * @param {express.request} req incoming request
   * @param {express.response} res response object
   */
  getUser(req, res) {
    const errors =
        utils.checkRequired(req.params, ['email']).concat(validate(req.params));
    if (errors.length != 0) {
      errorResponse(res, errors.join('\n'));
      return;
    }

    this.userModel.getUser(req.params, res);
  }

  /**
   * Log in method.
   * @param {express.request} req incoming request
   * @param {express.response} res response object
   */
  signIn(req, res) {
    checkEmailAndPassword(
        req, res, this.userModel.signIn.bind(this.userModel),
        'Email or password is incorrect', {clientShowMessage: true});
  }

  /**
   * Separate function for facebook login.
   * @param {express.request} req incoming request
   * @param {express.response} res response object
   */
  facebookLogin(req, res) {
    const errors = utils.checkRequired(req.body, [
      'email',
      'facebookId',
    ]);

    if (errors.length != 0) {
      errorResponse(res, errors.join('\n'), {clientShowMessage: false});
      return;
    }

    this.userModel.facebookLogin(req.body, res);
  }

  /**
   * Separate function for google login.
   * @param {express.request} req incoming request
   * @param {express.response} res response object
   */
  googleLogin(req, res) {
    const errors = utils.checkRequired(req.body, [
      'email',
      'googleId',
    ]);

    if (errors.length != 0) {
      errorResponse(res, errors.join('\n'), {clientShowMessage: false});
      return;
    }

    this.userModel.googleLogin(req.body, res);
  }

  /**
   * Checking of password method.
   * @param {express.request} req incoming request
   * @param {express.response} res response object
   */
  checkPassword(req, res) {
    checkEmailAndPassword(
        req, res, this.userModel.signIn.bind(this.userModel), 'Wrong password');
  }

  /**
   * Check phone API route.
   * @param {express.request} req incoming request
   * @param {express.response} res response object
   */
  checkPhone(req, res) {
    phoneCheck(req, res, this.userModel.checkPhone.bind(this.userModel));
  }

  /**
   * Get user profile by phone.
   * @param {express.request} req incoming request
   * @param {express.response} res response object
   */
  getByPhone(req, res) {
    phoneCheck(req, res, this.userModel.getByPhone.bind(this.userModel));
  }

  /**
   * Get user profile by email.
   * @param {express.request} req incoming request
   * @param {express.response} res response object
   */
  getByEmail(req, res) {
    const errors =
        utils.checkRequired(req.body, ['email']).concat(validate(req.body));
    if (errors.length != 0) {
      errorResponse(res, errors.join('\n'));
      return;
    }

    this.userModel.getByEmail(req.body.email, res);
  }

  /**
   * Update user profile API route.
   * @param {express.request} req incoming request
   * @param {express.response} res response object
   */
  updateUser(req, res) {
    if (req.body.hasOwnProperty('email')) {
      const oldEmail = req.params.email;
      const newEmail = req.body.email;

      if (!validator.isEmail(newEmail)) {
        errorResponse(res, 'Invalid new email');
        return;
      }

      this.userModel.updateEmail(newEmail, oldEmail, res);
      return;
    } else if (req.body.hasOwnProperty('phone_number')) {
      const email = req.params.email;
      const newPhoneNumber = req.body.phone_number;

      const filteredPhone = filterPhoneNumber(newPhoneNumber);

      // @ts-ignore
      if (!validator.isMobilePhone(newPhoneNumber)) {
        errorResponse(res, 'Invalid phone number');
        return;
      }

      this.userModel.updatePhoneNumber(filteredPhone, email, res);
      return;
    }

    const userObj = {...req.body, email: req.params.email};

    // id, weno_id, password, type, weno_phone are not allowed to change
    delete userObj.id;
    delete userObj.weno_id;
    delete userObj.password;
    delete userObj.type;
    delete userObj.weno_phone;

    if (Object.keys(userObj).length === 0) {
      errorResponse(res, 'Nothing to update');
      return;
    }

    const errors = validate(userObj);

    if (errors.length != 0) {
      errorResponse(res, errors.join('\n'));
      return;
    }

    this.userModel.updateUser(userObj, res);
  }

  /**
   * Update user password API route.
   * @param {express.request} req incoming request
   * @param {express.response} res response object
   */
  updatePassword(req, res) {
    const errors =
        utils.checkRequired(req.body, ['oldPassword', 'newPassword']);

    if (errors.length != 0) {
      errorResponse(res, errors.join('\n'));
      return;
    }

    this.userModel.updatePassword(req.params.email, req.body, res);
  }

  /**
   * Reset user password API route.
   * @param {express.request} req incoming request
   * @param {express.response} res response object
   */
  resetPassword(req, res) {
    const errors = utils.checkRequired(req.body, ['password']);

    if (errors.length != 0) {
      errorResponse(res, errors.join('\n'));
      return;
    }

    this.userModel.resetPassword(req.params.email, req.body, res);
  }

  /**
   * Forgot password API route.
   * @param {express.request} req incoming request
   * @param {express.response} res response object
   */
  forgotPassword(req, res) {
    const errors = utils.checkRequired(req.params, ['email']);
    errors.push(...utils.checkRequired(req.body, ['method']));
    errors.push(...validate(req.params));

    if (req.body.method !== 'email' && req.body.method !== 'sms') {
      errors.push('Invalid confirmation method.');
    }

    if (errors.length != 0) {
      errorResponse(res, errors.join('\n'));
      return;
    }

    this.userModel.forgotPassword(
        req.params.email, req.body.method, req.body.deeplink, res);
  }

  /**
   * Confirm action API route.
   * @param {express.request} req incoming request
   * @param {express.response} res response object
   */
  confirmAction(req, res) {
    const errors = utils.checkRequired(req.body, ['action', 'conf_code']);
    if (errors.length != 0) {
      errorResponse(res, errors.join('\n'));
      return;
    }

    this.userModel.confirmAction(req.params.email, req.body, res);
  }

  /**
   * Setup routes for user controller
   * @param {express.application} app application to setup
   */
  setupRoutes(app) {
    // create question for user
    app.post('/api/users/question', this.userQuestion.bind(this));

    // registrate new user
    // profile in chargify will also be created
    app.post('/api/:token/users/add', this.userRegistration.bind(this));

    // get user by email
    app.get('/api/:token/user/:email', this.getUser.bind(this));

    // login
    app.post('/api/:token/user', this.signIn.bind(this));

    // login via facebook
    app.post('/api/:token/user/facebookLogin', this.facebookLogin.bind(this));

    // login via google
    app.post('/api/:token/user/googleLogin', this.googleLogin.bind(this));

    // check password
    app.post('/api/:token/user/checkpassword', this.checkPassword.bind(this));

    // check phone number
    app.post('/api/:token/user/checkphone', this.checkPhone.bind(this));

    // get user info by phone number
    app.post('/api/:token/user/getByPhone', this.getByPhone.bind(this));

    // get user info by email
    app.post('/api/:token/user/getByEmail', this.getByEmail.bind(this));

    // send email function
    app.post('/api/:token/user/:email/forgot', this.forgotPassword.bind(this));

    // user info updating function
    app.post('/api/:token/user/:email/update', this.updateUser.bind(this));

    // update password for user
    app.post(
        '/api/:token/user/:email/password', this.updatePassword.bind(this));

    // reset password for user
    app.post(
        '/api/:token/user/:email/resetPassword', this.resetPassword.bind(this));

    // confirm action for user
    app.post('/api/:token/user/:email/confirm', this.confirmAction.bind(this));
  }
}

function checkEmailAndPassword(req, res, callback, ...failParams) {
  const errors = utils.checkRequired(req.body, ['email', 'password']);
  errors.push(...validate(req.body));

  if (errors.length != 0) {
    return errorResponse(res, errors.join('\n'));
  }

  callback(req.body, res, ...failParams);
}


function phoneCheck(req, res, callback) {
  const errors = utils.checkRequired(req.body, ['phone_number']);
  errors.push(...validate(req.body));

  if (errors.length != 0) {
    errorResponse(res, errors.join('\n'));
    return;
  }

  req.body.phone_number = filterPhoneNumber(req.body.phone_number);

  callback(req.body.phone_number, res);
}

function errorResponse(res, message, otherParams) {
  return utils.fail(res, 400, message, otherParams);
}

function validate(request) {
  const validators = {
    email: value => validator.isEmail(value),
    lastName: nameValidator,
    firstName: nameValidator,
    // @ts-ignore
    phoneNumber: value => validator.isMobilePhone(value),
    socialSecurityNumber: value => !isNaN(value),
    subscriptionType: value => value === 0 || value === 1,
  };

  const errors = [];

  for (const field in request) {
    if (validators[field]) {
      if (!validators[field](request[field])) {
        errors.push(`${startCase(field)} is not valid.`);
      }
    }
  }

  return errors;
}

function nameValidator(name) {
  let result = false;

  // @ts-ignore
  validator.isAlphaLocales.forEach(locale => {
    if (validator.isAlpha(name, locale)) result = true;
  });

  return result;
}

function filterPhoneNumber(phoneNumber) {
  return phoneNumber.replace(/[^0-9]/g, '').slice(0, 12);
}

module.exports = UserController;
