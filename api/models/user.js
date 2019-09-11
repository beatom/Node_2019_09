// Used for proper documantation
// eslint-disable-next-line no-unused-vars
const express = require('express');

const fs = require('fs');
const path = require('path');
const snakeCase = require('lodash/snakeCase');

const emailModule = require('../../lib/mail-module');
const smsModule = require('../../lib/sms-module');

const databaseModule = require('../../lib/database-module');
const chargifyModule = require('../../lib/chargify-module');

const utils = require('../../lib/utils');
const logger = require('../../logger');

class UserModel {
  /**
   * @param {senderModules} [senders]
   * @param {databaseModule} [dbModule]
   * @param {chargifyModule} [chargify]
   */
  constructor(senders, dbModule, chargify) {
    this.senders = senders || senderModules;
    this.dbModule = dbModule || databaseModule;
    this.chargify = chargify || chargifyModule;
  }

  /**
   * Registrate user in application.
   * @param {Object} obj user data
   * @param {express.response} res response object
   */
  userRegistration(obj, res) {
    const insertArgs = objToSnakeCase(obj);
    let wenoUserId = null;
    let userId = null;

    let user = null;

    insertArgs.weno_phone = insertArgs.phone_number;

    const emailPromise = this.dbModule.queryDb(
        'select id from users where email = ?', [insertArgs.email]);
    const wenoIdPromise = this.dbModule.queryDb(
        'select id, weno_id from users where phone_number = ?',
        [insertArgs.phone_number]);

    Promise.all([emailPromise, wenoIdPromise])
        .then(values => {
          const emailRes = values[0][0];
          const wenoRes = values[1][0];
          if (emailRes) {
            utils.fail(
                res, 400, 'User with this email already exists',
                {clientShowMessage: true});
            return false;
          }
          if (wenoRes) {
            userId = wenoRes.id;
            wenoUserId = wenoRes.weno_id;
            return this.dbModule.update({
              table: 'users',
              fields: insertArgs,
              where: {weno_id: wenoRes.weno_id},
            });
          } else {
            // if not receive any rx, generate id
            insertArgs.weno_id = wenoUserId = utils.generateId();
            return this.dbModule.insert({table: 'users', args: insertArgs});
          }
        })
        .then(result => {
          if (!result) {
            return;
          }
          if (result.insertId) {
            userId = result.insertId;
          }
          insertArgs.id = userId;
          insertArgs.weno_id = wenoUserId;

          user = insertArgs;
          user = removePassword(user);

          return this.chargify.customers.create({
            customer: {
              first_name: user.first_name,
              last_name: user.last_name,
              email: user.email,
              phone: '+' + user.phone_number,
              reference: user.id,
            },
          });
        })
        .then(
            body => {
              if (body) {
                user.chargify_customer_id = body.customer.id;
                return this.dbModule.update({
                  table: 'users',
                  fields: {chargify_customer_id: body.customer.id},
                  where: {id: user.id},
                });
              }
            },
            error => {
              // customer in chargify was not created because of some error
              utils.success(res, user);
              logger.error('Customer profile creation error: %O', error);
            })
        .then(result => result && utils.success(res, user))
        .catch(error => utils.error(res, error));
  }

  /**
   * Saves question for user.
   * @param {Object} obj request
   * @param {express.response} res response object
   */
  userQuestion(obj, res) {
    const args = {...obj};
    this.dbModule
        .queryDb(
            'select question from questions ' +
                'where email = ? and question = ?',
            [args.email, args.question])
        .then(result => {
          if (result[0]) {
            utils.fail(
                res, 400, 'Already have question', {clientShowMessage: true});
          } else {
            return this.dbModule.insert({table: 'questions', args});
          }
        })
        .then(
            result => result &&
                utils.success(res, {status: 200, message: 'Question saved'}))
        .catch(error => utils.error(res, error));
  }

  /**
   * Function to get user or admin user profile info by email.
   * @param {{email: string}} obj user object
   * @param {express.response} res response object
   */
  getUser(obj, res) {
    const email = obj.email;

    const usersPromise =
        this.dbModule.queryDb('select * from users where email = ?', [email]);
    const adminUsersPromise = this.dbModule.queryDb(
        'select * from admin_users where email = ?', [email]);

    Promise.all([usersPromise, adminUsersPromise])
        .then(result => {
          const foundUser = result[0][0];
          const foundAdminUser = result[0][1];

          if (foundUser) {
            utils.success(res, foundUser);
          } else if (foundAdminUser) {
            utils.success(res, foundAdminUser);
          } else {
            userNotFound(res, obj.email);
          }
        })
        .catch(error => utils.error(res, error));
  }

  /**
   * Function for user login.
   * @param {{email: string, password: string}} user credentials
   * @param {express.response} res response object
   * @param {Object[]} failParams failure response parameters
   */
  signIn(user, res, ...failParams) {
    this.dbModule.queryDb('select * from users where email = ?', [user.email])
        .then(result => {
          if (result[0] && utils.compare(user.password, result[0].password)) {
            if (result[0]['password'] !== undefined) {
              delete result[0]['password'];
            }
            utils.success(res, result[0]);
          } else {
            utils.fail(res, 401, ...failParams);
          }
        })
        .catch(error => utils.error(res, error));
  }

  /**
   * Special function to handle login via facebook.
   * @param {Object} facebookData data, coming from facebook
   * @param {express.response} res repsonse object
   */
  facebookLogin(facebookData, res) {
    const dbData = objToSnakeCase(facebookData);

    /**
     * @return {Promise}
     */
    const selectByFacebookId = () => this.dbModule.queryDb(
        'select * from users where facebook_id = ?', [dbData.facebook_id]);

    /**
     * @return {Promise}
     */
    const selectByEmail = () => this.dbModule.queryDb(
        'select * from users where email = ?', [dbData.email]);

    function userResponse(result) {
      // user is found
      delete result[0].password;
      utils.success(res, result[0]);
      return;
    }

    selectByFacebookId()
        .then(result => result[0] ? userResponse(result) : selectByEmail())
        .then(result => {
          if (result) {
            if (result[0]) {
              // user found by email,
              // need to update user account
              const updateFields = {facebook_id: dbData.facebook_id};

              if (!result[0].first_name && dbData.first_name) {
                updateFields.first_name = dbData.first_name;
              }

              if (!result[0].last_name && dbData.last_name) {
                updateFields.last_name = dbData.last_name;
              }

              return this.dbModule.update({
                table: 'users',
                fields: updateFields,
                where: {id: result[0].id},
              });
            } else {
              // user not found by email too,
              // need to insert user info to db
              dbData.weno_id = utils.generateId();
              return this.dbModule.insert({table: 'users', args: dbData});
            }
          }
        })
        .then(result => result && selectByFacebookId())
        .then(result => result && userResponse(result))
        .catch(error => utils.error(res, error));
  }

  /**
   * Special function to handle login via google.
   * @param {Object} googleData data, coming from google
   * @param {express.response} res response object
   */
  googleLogin(googleData, res) {
    const dbData = objToSnakeCase(googleData);

    /**
     * @return {Promise}
     */
    const selectByGoogleId = () => this.dbModule.queryDb(
        'select * from users where google_id = ?', [dbData.google_id]);

    /**
     * @return {Promise}
     */
    const selectByEmail = () => this.dbModule.queryDb(
        'select * from users where email = ?', [dbData.email]);

    function userResponse(result) {
      // user is found
      delete result[0].password;
      utils.success(res, result[0]);
      return;
    }

    selectByGoogleId()
        .then(result => result[0] ? userResponse(result) : selectByEmail())
        .then(result => {
          if (result) {
            if (result[0]) {
              // user found by email,
              // need to update user account
              const updateFields = {google_id: dbData.google_id};

              if (!result[0].first_name && dbData.first_name) {
                updateFields.first_name = dbData.first_name;
              }

              if (!result[0].last_name && dbData.last_name) {
                updateFields.last_name = dbData.last_name;
              }

              return this.dbModule.update({
                table: 'users',
                fields: updateFields,
                where: {id: result[0].id},
              });
            } else {
              // user not found by email too,
              // need to insert user info to db
              dbData.weno_id = utils.generateId();
              return this.dbModule.insert({table: 'users', args: dbData});
            }
          }
        })
        .then(result => result && selectByGoogleId())
        .then(result => result && userResponse(result))
        .catch(error => utils.error(res, error));
  }

  /**
   * Get user profile by phone number.
   * @param {string} phoneNumber user's phone number
   * @param {express.response} res response object
   */
  checkPhone(phoneNumber, res) {
    this.dbModule
        .queryDb('select id from users where phone_number = ?', [phoneNumber])
        .then(result => {
          if (result[0]) {
            utils.success(res, result[0]);
          } else {
            utils.fail(res, 404, 'Phone number not found');
          }
        })
        .catch(error => utils.error(res, error));
  }

  /**
   * Get user profile by phone number.
   * @param {string} phoneNumber user's phone number
   * @param {express.response} res response object
   */
  getByPhone(phoneNumber, res) {
    this.dbModule
        .queryDb('select * from users where phone_number = ?', [phoneNumber])
        .then(result => {
          if (result[0]) {
            utils.success(res, result[0]);
          } else {
            utils.fail(res, 404, 'Phone number not found');
          }
        })
        .catch(error => utils.error(res, error));
  }

  /**
   * Get user profile by email.
   * @param {string} email user's email
   * @param {express.response} res response object
   */
  getByEmail(email, res) {
    this.dbModule.queryDb('select * from users where email = ?', [email])
        .then(result => {
          if (result[0]) {
            utils.success(res, result[0]);
          } else {
            utils.fail(res, 404, 'Email not found');
          }
        })
        .catch(error => utils.error(res, error));
  }

  /**
   * Function to update email in user profile in database.
   * @param {string} newEmail new email
   * @param {string} oldEmail old email
   * @param {express.response} res response object
   */
  updateEmail(newEmail, oldEmail, res) {
    this.dbModule
        .queryDb('select id from users where email = ?', [oldEmail])
        .then(result => {
          if (result[0]) {
            return this.dbModule.update({
              table: 'users',
              fields: {email: newEmail},
              where: {id: result[0].id},
            });
          }
        })
        .then(
            result => result ? successUpdate(res, oldEmail) :
                               userNotFound(res, oldEmail))
        .catch(error => utils.error(res, error, 'Error during email update'));
  }

  /**
   * Function to update phone number in user profile in database.
   * @param {string} newPhoneNumber new phone
   * @param {string} email email of user to update phone
   * @param {express.response} res response object
   */
  updatePhoneNumber(newPhoneNumber, email, res) {
    // phone number in rxes should not be updated,
    // so update phone in profile only
    this.dbModule
        .queryDb('select id, weno_phone from users where email = ?', [email])
        .then(result => {
          if (result[0]) {
            const updateFields = {phone_number: newPhoneNumber};

            if (result[0].weno_phone === '') {
              updateFields.weno_phone = newPhoneNumber;
            }

            return this.dbModule.update({
              table: 'users',
              fields: updateFields,
              where: {id: result[0].id},
            });
          }
        })
        .then(
            result =>
                result ? successUpdate(res, email) : userNotFound(res, email))
        .catch(e => utils.error(res, e, 'Error during phone number update'));
  }

  /**
   * Function to update most of the fields in user profile
   * @param {Object} obj fields with new values
   * @param {express.response} res response object
   */
  updateUser(obj, res) {
    this.dbModule.queryDb('select id from users where email = ?', [obj.email])
        .then(result => {
          if (result[0]) {
            const updateFields = objToSnakeCase(obj);

            delete updateFields.email;

            return this.dbModule.update({
              table: 'users',
              fields: updateFields,
              where: {id: result[0].id},
            });
          }
        })
        .then(
            result => result ? successUpdate(res, obj.email) :
                               userNotFound(res, obj.email))
        .catch(error => utils.error(res, error, 'Error during update'));
  }

  /**
   * Function to update password for user in database.
   * @param {string} email email of user to update password to
   * @param {{oldPassword: string, newPassword: string}} body request
   * @param {express.response} res response object
   */
  updatePassword(email, body, res) {
    // additional variable to distinguish 404 and 401 case
    let invalidPassword = false;
    this.dbModule
        .queryDb('select id, password from users where email = ?', [email])
        .then(result => {
          if (result[0]) {
            if (utils.compare(body.oldPassword, result[0].password)) {
              return this.dbModule.update({
                table: 'users',
                fields: {
                  password: utils.encodePasswordForDb(body.newPassword),
                },
                where: {id: result[0].id},
              });
            } else {
              utils.fail(res, 401, 'Invalid old password');
              invalidPassword = true;
              return;
            }
          }
        })
        .then(result => {
          // when result not empty, means that profile was updated
          // result will be empty if not found(need to return 404)
          // or if already responded with 401
          if (result) {
            if (result.changedRows == 1) {
              successUpdate(res, email);
            } else {
              const error = new Error('Unknown update error');
              error.user = email;
              error.body = body;
              error.result = result;
              throw error;
            }
          } else {
            if (!invalidPassword) {
              userNotFound(res, email);
            }
          }
        })
        .catch(error => utils.error(res, error, 'Error during update'));
  }

  /**
   * Function to update password for user in database.
   * @param {string} email email of user to update password to
   * @param {{password: string}} body request
   * @param {express.response} res response object
   */
  resetPassword(email, body, res) {
    this.dbModule.queryDb('select id from users where email = ?', [email])
        .then(result => {
          if (result[0]) {
            return this.dbModule.update({
              table: 'users',
              fields: {
                password: utils.encodePasswordForDb(body.password),
              },
              where: {id: result[0].id},
            });
          }
        })
        .then(
            result =>
                result ? successUpdate(res, email) : userNotFound(res, email))
        .catch(error => utils.error(res, error, 'Error during update'));
  }

  /**
   * Function, that searches for user profile by given email,
   * generates confirmation code, sends confirmation and saves
   * pending confirmation to database.
   * @param {string} email email of user to send confirmation to
   * @param {string} method method of sending confirmation (email or sms)
   * @param {boolean} deeplink insert deeplink or not
   * @param {express.response} res response object
   */
  forgotPassword(email, method, deeplink, res) {
    this.dbModule
        .queryDb(
            'select id, email, first_name, phone_number ' +
                'from users where email = ?',
            [email])
        .then(result => {
          if (result[0]) {
            const confirmationCode = utils.randomNumber(4);
            result[0].deeplink = deeplink;
            const sendDetails =
                getSendDetails(method, result[0], confirmationCode);

            const sendCallback = (err, message) => {
              if (err) {
                utils.error(
                    res, err,
                    `Error sending confirmation via ` +
                        `${method} method to ${sendDetails.to}`);
                return;
              }
              logger.debug('Send forgot message result: %O', message);
              this.addConfirmationToDb(
                  result[0].id, 'forgotPassword', confirmationCode);
              return utils.success(res, {
                status: 200,
                message: `Confirmation sent to: ${sendDetails.to}`,
              });
            };

            this.senders[method].sendForgotMessage(
                sendDetails.to, sendDetails.body, sendCallback);
          } else {
            return userNotFound(res, email);
          }
        })
        .catch(error => utils.error(res, error));
  }

  /**
   * Function to confirm action for user from database.
   * Firstly - finds user_id for given email.
   * Secondly - finds row with confirmation code, action
   * and user_id in confirmations table.
   * If nothing were found - return error, if confirmed - deletes row.
   * @param {string} email email of user to confirm action for
   * @param {{conf_code: string, action: string}} request confirmation request
   * @param {express.response} res response object
   */
  confirmAction(email, request, res) {
    this.dbModule.queryDb('select id from users where email = ?', [email])
        .then(result => {
          if (result[0]) {
            return this.dbModule.queryDb(
                'select conf_id from confirmation where ' +
                    'user_id = ? and ' +
                    'conf_code = ? and ' +
                    'action = ? and ' +
                    'expires > now()',
                [result[0].id, request.conf_code, request.action]);
          }
        })
        .then(result => {
          if (result) {
            if (result[0]) {
              utils.success(res, {
                status: 200,
                message: `Successfully confirmed ${request.action} ` +
                    `action for user ${email}`,
              });
              this.dbModule.queryDb(
                  'delete from confirmation where conf_id = ?',
                  [result[0].conf_id]);
            } else {
              utils.fail(
                  res, 400,
                  `Action ${request.action} for user ${email} not confirmed`);
            }
          } else {
            userNotFound(res, email);
          }
        })
        .catch(error => utils.error(res, error));
  }

  /**
   * Inserts new row into confirmations table with expires += 1 day.
   * @private
   * @param {number} userId id of user
   * @param {string} action action to confirm
   * @param {string} confirmationCode confirmation code
   */
  addConfirmationToDb(userId, action, confirmationCode) {
    this.dbModule.queryDb(
        'insert into confirmation set ' +
            'user_id = ?, ' +
            'conf_code = ?, ' +
            'action = ?, ' +
            'expires = now() + interval 1 day',
        [userId, confirmationCode, action]);
  }
}

const senderModules = {
  email: emailModule,
  sms: smsModule,
};

function getSendDetails(method, user, confCode) {
  switch (method) {
    case 'email':
      return {
        to: user.email,
        body: generateHtmlForPassReset(user, confCode),
      };
    case 'sms':
      return {
        to: user.phone_number,
        body: generateSmsForPassReset(user, confCode),
      };
  }
}

function successUpdate(res, email) {
  return utils.success(res, {
    status: 200,
    message: `Successfully updated user with email ${email}`,
  });
}

function userNotFound(res, email) {
  return utils.fail(res, 404, `User profile with email ${email} not found`);
}

function objToSnakeCase(obj) {
  const localObj = {};
  for (const field of Object.keys(obj)) {
    localObj[snakeCase(field)] = obj[field];
  }
  return localObj;
}

function removePassword(data) {
  if (data.password !== undefined) {
    delete data.password;
  }

  return data;
}

function generateHtmlForPassReset(user, verificationCode) {
  const tPath =
      path.resolve(__dirname, '../../lib/mail-module/reset-pass.html');
  const template = fs.readFileSync(tPath).toString();
  let result = template.replace('{{firstName}}', user.first_name)
      .replace(/{{email}}/g, user.email)
      .replace('{{verificationCode}}', verificationCode);

  if (user.deeplink) {
    result = result.replace(/{{deeplink && (.*)}}/, '$1');
  } else {
    result = result.replace(/{{deeplink && (.*)}}/, '');
  }

  return result;
}

function generateSmsForPassReset(user, verificationCode) {
  return `${user.first_name}, this is your verification code: ` +
      `${verificationCode}`;
}

module.exports = UserModel;
