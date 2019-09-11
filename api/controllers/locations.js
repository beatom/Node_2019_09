// Used for proper documantation
// eslint-disable-next-line no-unused-vars
const express = require('express');

const utils = require('../../lib/utils');

class LocationsController {
  constructor(model) {
    this.locationsModel = model;
  }

  /**
   * Get all location API route.
   * @param {express.request} req incoming request
   * @param {express.response} res response object
   */
  getLocations(req, res) {
    this.locationsModel.getLocations(req.params.userId, res);
  }

  /**
   * Create location API route.
   * @param {express.request} req incoming request
   * @param {express.response} res response object
   */
  createLocation(req, res) {
    // prevent id injecting
    delete req.body.id;
    delete req.body.user_id;

    const errors = utils.checkRequired(req.body, [
      'name',
      'address',
      'city',
      'region',
      'zip',
    ]);
    if (errors.length != 0) {
      utils.fail(res, 400, errors.join('\n'));
      return;
    }

    this.locationsModel.createLocation(req.params.userId, req.body, res);
  }

  /**
   * Get location API route.
   * @param {express.request} req incoming request
   * @param {express.response} res response object
   */
  getLocation(req, res) {
    const userId = req.params.userId;
    const locId = req.params.locationId;

    if (locId === 'default') {
      this.locationsModel.getDefaultLocation(userId, res);
    } else {
      this.locationsModel.getLocation(userId, locId, res);
    }
  }

  /**
   * Edit location API route.
   * @param {express.request} req incoming request
   * @param {express.response} res response object
   */
  editLocation(req, res) {
    // prevent id changing
    delete req.body.id;
    delete req.body.user_id;

    if (Object.keys(req.body).length === 0) {
      utils.fail(res, 400, 'Edit location request cannot be empty');
      return;
    }

    this.locationsModel.editLocation(
        req.params.userId, req.params.locationId, req.body, res);
  }

  /**
   * Delete location API route.
   * @param {express.request} req incoming request
   * @param {express.response} res response object
   */
  deleteLocation(req, res) {
    this.locationsModel.deleteLocation(
        req.params.userId, req.params.locationId, res);
  }

  /**
   * Check location existence for a user by location name.
   * @param {express.request} req incoming request
   * @param {express.response} res response object
   */
  checkLocation(req, res) {
    const errors = utils.checkRequired(req.body, ['name']);
    if (errors.length != 0) {
      utils.fail(res, 400, errors.join('\n'));
      return;
    }

    const userId = Number(req.params.userId);
    this.locationsModel.checkLocation(
        userId, req.body.name, req.body.locationId, res);
  }

  /**
   * Sets is_default flag to true in location row for a user.
   * It also sets this flag to false for all other locations for a user.
   * @param {express.request} req incoming request
   * @param {express.response} res response object
   */
  setDefaultLocation(req, res) {
    const userId = Number(req.params.userId);
    const locationId = Number(req.params.locationId);
    this.locationsModel.setDefaultLocation(userId, locationId, res);
  }

  /**
   * Setup routes for locations controller
   * @param {express.application} app application to setup
   */
  setupRoutes(app) {
    // Read and create locations endpoints
    app.route('/api/:token/user/:userId/locations')
        .get(this.getLocations.bind(this))
        .post(this.createLocation.bind(this));

    // Check location endpoint (for user by location name)
    app.route('/api/:token/user/:userId/locations/check')
        .post(this.checkLocation.bind(this));

    // Read, update and delete location endpoints
    app.route('/api/:token/user/:userId/locations/:locationId')
        .get(this.getLocation.bind(this))
        .post(this.editLocation.bind(this))
        .delete(this.deleteLocation.bind(this));

    // Set default location endpoint
    app.route('/api/:token/user/:userId/locations/:locationId/set_default')
        .get(this.setDefaultLocation.bind(this));
  }
}

module.exports = LocationsController;
