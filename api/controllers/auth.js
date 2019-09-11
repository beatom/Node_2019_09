// Used for proper documantation
// eslint-disable-next-line no-unused-vars
const express = require('express');

const databaseModule = require('../../lib/database-module');

const utils = require('../../lib/utils');

class AuthController {
  /**
   * @constructor
   * @param {databaseModule} [dbModule] database module to use
   */
  constructor(dbModule) {
    this.dbModule = dbModule || databaseModule;
  }

  /**
   * Middleware to authenticate incoming requests.
   * All apps registered stored in table 'apps'.
   * All permissions avalaible are stored in table 'permissions'.
   * Permissions for applications are connected in
   * many-to-many relationship via table 'apps_to_permissions'.
   * @param {express.request} req incoming request
   * @param {express.response} res response object
   * @param {Function} next next handler on route
   */
  authentificate(req, res, next) {
    // cannot use req.url inherited from http module because express rewrites it
    const url = req.originalUrl;

    // token needs to be parsed because express doesn`t parse it yet
    const [token, permission] = getTokenFromUrl(url);

    this.dbModule.queryDb(
        'select name from permissions p ' +
            'inner join apps_to_permissions a2p ' +
            'on p.permission_id = a2p.permission_id ' +
            'where app_id = (select app_id from apps where token = ?) ' +
            'and name = ?',
        [token, permission])
        .then(result => {
          if (result[0]) {
            next();
          } else {
            utils.fail(res, 403, 'Application don`t have enough permissions');
          }
        })
        .catch(err => utils.error(res, err));
  }

  /**
   * Setup routes for auth controller
   * @param {express.application} app application to setup
   */
  setupRoutes(app) {
    // middleware to control token in requests
    app.use(utils.permissionsRegex, this.authentificate.bind(this));
  }
}

/**
 * Function to get token and path from url
 * @private
 * @param {string} url url to get parameters from
 * @return {Array}
 */
function getTokenFromUrl(url) {
  // first capturing group - token
  return url.match(utils.permissionsRegex).slice(1);
}

module.exports = AuthController;
