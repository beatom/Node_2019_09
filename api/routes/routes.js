// Used for proper documantation
// eslint-disable-next-line no-unused-vars
const express = require('express');

const controllers = require('../controllers');
const models = require('../models');

const logger = require('../../logger');

/**
 * @param {express.application} app
 */
module.exports = function(app) {
  // create models
  const userModel = new models.UserModel();
  const questionModel = new models.QuestionModel();
  const rxModel = new models.RxModel();
  const chargifyModel = new models.ChargifyModel();
  const webhooksModel = new models.WebhooksModel();
  const pharmaciesModel = new models.PharmaciesModel();
  const drugsModel = new models.DrugsModel();
  const locationsModel = new models.LocationsModel();
  const claimsModel = new models.ClaimsModel();

  // create controllers
  const authController = new controllers.AuthController();
  const userController = new controllers.UserController(userModel);
  const questionController = new controllers.QuestionController(questionModel);
  const rxController = new controllers.RxController(rxModel);
  const logController = new controllers.LogController();
  const chargifyController = new controllers.ChargifyController(chargifyModel);
  const webhooksController = new controllers.WebhooksController(webhooksModel);
  const pharmaciesController =
      new controllers.PharmaciesController(pharmaciesModel);
  const drugsController = new controllers.DrugsController(drugsModel);
  const locationsController =
      new controllers.LocationsController(locationsModel);
  const claimsController = new controllers.ClaimsController(claimsModel);

  // setup token authorization middleware
  authController.setupRoutes(app);

  // setup user-related endpoints
  userController.setupRoutes(app);

  // setup questions endpoints
  questionController.setupRoutes(app);

  // setup rx-related endpoints
  rxController.setupRoutes(app);

  // setup logging endpoint
  logController.setupRoutes(app);

  // setup chargify-related endpoints
  chargifyController.setupRoutes(app);

  // setup chargify webhooks endpoints
  webhooksController.setupRoutes(app);

  // setup pharmacies endpoints
  pharmaciesController.setupRoutes(app);

  // setup drugs endpoints
  drugsController.setupRoutes(app);

  // setup locations endpoints
  locationsController.setupRoutes(app);

  // setup claims endpoints
  claimsController.setupRoutes(app);

  // error middleware
  app.use((err, req, res, next) => {
    if (err.status) {
      return res.status(err.status).json({
        status: err.status,
        message: err.message,
      });
    }

    logger.error('Request to: %s failed with error: %O', req.originalUrl, err);
    res.status(500).json({status: 500, message: 'Internal server error'});
  });

  app.get('/redirect', (req, res) => {
    res.redirect(req.query.url);
  });

  // catch-all not found route
  app.all('*', (req, res) => {
    logger.warn('Attempt to request to: %s', req.originalUrl);
    res.status(404).json({status: 404, message: 'Not found'});
  });
};
