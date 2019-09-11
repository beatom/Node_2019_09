// Used for proper documantation
// eslint-disable-next-line no-unused-vars
const express = require('express');

const utils = require('../../lib/utils');
const databaseModule = require('../../lib/database-module');

class LocationsModel {
  /**
   * @param {databaseModule} [dbModule]
   */
  constructor(dbModule) {
    this.dbModule = dbModule || databaseModule;
  }

  /**
   * Function that returns all locations for given user id
   * @param {number} userId id of user
   * @param {express.response} res response object
   */
  getLocations(userId, res) {
    this.userIdExists(userId)
        .then(result => {
          if (result) {
            return this.dbModule
                .queryDb('select * from locations where user_id = ?', [userId])
                .then(result => utils.success(res, result || []));
          } else {
            userIdNotFound(res, userId);
          }
        })
        .catch(error => utils.error(res, error));
  }

  /**
   * Function to add location for user.
   * Saves new location only if name is unique.
   * Name is unique not globally for table but for one user.
   * For example, user 1 can have 'Home' location and
   * user 2 can have 'Home' location, but none of them
   * can have 2 locations with equal names.
   * @param {number} userId id of user
   * @param {Object} locationData location data to save
   * @param {express.response} res response object
   */
  createLocation(userId, locationData, res) {
    this.userIdExists(userId)
        .then(result => {
          if (result) {
            return this.dbModule.queryDb(
                'select count(id) as id_count from locations ' +
                    'where user_id = ? and name = ?',
                [userId, locationData.name]);
          } else {
            userIdNotFound(res, userId);
          }
        })
        .then(result => {
          if (result) {
            if (result[0].id_count === 0) {
              locationData.user_id = userId;

              return this.dbModule.insert(
                  {table: 'locations', args: locationData});
            } else {
              utils.fail(
                  res, 400,
                  `Location with name ${locationData.name} ` +
                      `already exists for user ${userId}`);
            }
          }
        })
        .then(result => {
          if (result) {
            locationData.id = result.insertId;
            utils.success(res, locationData);
          }
        })
        .catch(error => utils.error(res, error));
  }

  /**
   * Function that returns specified location for specified user.
   * @param {number} userId id of user
   * @param {number} locationId id of location
   * @param {express.response} res response object
   */
  getLocation(userId, locationId, res) {
    this.userIdExists(userId)
        .then(result => {
          if (result) {
            return this.dbModule.queryDb(
                'select * from locations where user_id = ? and id = ?',
                [userId, locationId]);
          } else {
            userIdNotFound(res, userId);
          }
        })
        .then(result => {
          if (result) {
            if (result[0]) {
              return utils.success(res, result[0]);
            } else {
              return utils.fail(res, 404, 'Location not found');
            }
          }
        })
        .catch(error => utils.error(res, error));
  }

  /**
   * Function that returns default location for specified user.
   * @param {number} userId id of user
   * @param {express.response} res response object
   */
  getDefaultLocation(userId, res) {
    this.userIdExists(userId)
        .then(result => {
          if (result) {
            return this.dbModule.queryDb(
                'select * from locations where user_id = ? ' +
                    'and is_default = true',
                [userId]);
          } else {
            userIdNotFound(res, userId);
          }
        })
        .then(result => {
          if (result) {
            if (result[0]) {
              return utils.success(res, result[0]);
            } else {
              return utils.success(res, {});
            }
          }
        })
        .catch(error => utils.error(res, error));
  }

  /**
   * Function to update specified location.
   * @param {number} userId id of user
   * @param {number} locationId id of location
   * @param {Object} newLocationData updated location data
   * @param {express.response} res response object
   */
  editLocation(userId, locationId, newLocationData, res) {
    this.userIdExists(userId)
        .then(result => {
          if (result) {
            return this.dbModule.queryDb(
                'select id from locations where user_id = ? and id = ?',
                [userId, locationId]);
          } else {
            userIdNotFound(res, userId);
          }
        })
        .then(result => {
          if (result) {
            if (result[0]) {
              return this.dbModule.update({
                table: 'locations',
                fields: newLocationData,
                where: {id: locationId, user_id: userId},
              });
            } else {
              utils.fail(res, 404, 'Location not found');
            }
          }
        })
        .then(result => {
          if (result) {
            if (result.affectedRows === 1) {
              return this.dbModule.queryDb(
                  'select * from locations where user_id = ? and id = ?',
                  [userId, locationId]);
            } else {
              utils.error(res, new Error('Update error'), 'Update error');
            }
          }
        })
        .then(result => result && utils.success(res, result[0]))
        .catch(error => utils.error(res, error));
  }

  /**
   * Function that deletes specified location for specified user.
   * @param {number} userId id of user
   * @param {number} locationId id of location
   * @param {express.response} res response object
   */
  deleteLocation(userId, locationId, res) {
    this.userIdExists(userId)
        .then(result => {
          if (result) {
            return this.dbModule.queryDb(
                'delete from locations where id = ? and user_id = ?',
                [locationId, userId]);
          } else {
            userIdNotFound(res, userId);
          }
        })
        .then(result => {
          if (result) {
            if (result.affectedRows === 1) {
              utils.success(res, {
                status: 200,
                message: 'Successfully deleted location',
              });
            } else {
              utils.fail(res, 404, 'Location not found');
            }
          }
        })
        .catch(error => utils.error(res, error));
  }

  /**
   * A function that checks if location with the specified
   * name exists for a particular user.
   * @param {number} userId id of user
   * @param {string} name location name
   * @param {number} locationId location identifier
   * @param {express.response} res response object
   */
  checkLocation(userId, name, locationId, res) {
    const locId = locationId ? Number(locationId) : 0;
    this.dbModule
        .queryDb(
            'select id from locations where user_id = ? ' +
                'and name = ? and id != ?',
            [userId, name, locId])
        .then(result => {
          if (result[0]) {
            utils.success(res, {
              status: 200,
              message: 'Location already exists',
            });
          } else {
            utils.fail(res, 404, 'Location not exists');
          }
        })
        .catch(error => utils.error(res, error));
  }

  /**
   * A function that sets the is_default flag for one
   * location to true and sets it to false for all rest.
   * @param {number} userId id of user
   * @param {number} locationId id of location
   * @param {express.response} res response object
   */
  setDefaultLocation(userId, locationId, res) {
    let location = null;
    this.dbModule.queryDb('select * from locations where user_id = ?', [userId])
        .then(result => {
          location = result.find(e => e.id === locationId);
          if (location) {
            location.is_default = 1;
          }
          // convert array of id objects to simple array of ids
          const resArr = Array.from(result, loc => loc.id);

          if (location && resArr.length !== 0) {
            const updates = [];
            const updateQuery =
                'update locations set is_default = ? where id = ?';
            resArr.forEach(
                loc => updates.push(this.dbModule.queryDb(
                    updateQuery, [loc === locationId, loc])));

            return Promise.all(updates);
          } else {
            utils.fail(res, 404, 'User or location not found');
          }
        })
        .then(result => result && utils.success(res, location))
        .catch(error => utils.error(res, error));
  }

  /**
   * Checks, if user with specified id exists in database.
   * @private
   * @param {number} userId id of user to check
   * @return {Promise<boolean>}
   */
  userIdExists(userId) {
    return this.dbModule
        .queryDb(
            'select count(id) as id_count from users where id = ?', [userId])
        .then(r => r[0].id_count === 1);
  }
}


function userIdNotFound(res, userId) {
  return utils.fail(res, 404, `User profile with id ${userId} not found`);
}

module.exports = LocationsModel;
