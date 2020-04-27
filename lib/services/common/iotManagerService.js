/*
 * Copyright 2015 Telefonica Investigación y Desarrollo, S.A.U
 *
 * This file is part of fiware-iotagent-lib
 *
 * fiware-iotagent-lib is free software: you can redistribute it and/or
 * modify it under the terms of the GNU Affero General Public License as
 * published by the Free Software Foundation, either version 3 of the License,
 * or (at your option) any later version.
 *
 * fiware-iotagent-lib is distributed in the hope that it will be useful,
 * but WITHOUT ANY WARRANTY; without even the implied warranty of
 * MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE.
 * See the GNU Affero General Public License for more details.
 *
 * You should have received a copy of the GNU Affero General Public
 * License along with fiware-iotagent-lib.
 * If not, see http://www.gnu.org/licenses/.
 *
 * For those usages not covered by the GNU Affero General Public License
 * please contact with::daniel.moranjimenez@telefonica.com
 *
 * Modified by: Federico M. Facca - Martel Innovate
 */

'use strict';

const got = require('got');
const errors = require('../../errors');
const constants = require('../../constants');
const config = require('../../commonConfig');
const intoTrans = require('../common/domain').intoTrans;
const alarms = require('../common/alarmManagement');
const logger = require('logops');
const context = {
        op: 'IoTAgentNGSI.IOTAMService'
    };

/**
 * Sends the registration to the IoT Agent Manager if it is configured in the config file.
 */
function register(callback) {
    function adaptServiceInformation(service) {
        /* jshint camelcase: false */
        return {
            apikey: service.apikey,
            token: service.trust,
            cbHost: service.cbHost,
            entity_type: service.type,
            resource: service.resource,
            service: service.service,
            service_path: service.subservice,
            attributes: service.attributes,
            static_attributes: service.staticAttributes,
            timezone: service.timezone,
            timestamp: service.timestamp,
            autoprovision: service.autoprovision
        };
    }

    function getServices() {
        return new Promise((resolve, reject) => {
            config.getGroupRegistry().list(null, null, null, function(error, results) {
                if (error) {
                    return reject (error);
                }
                return resolve(results.services.map(adaptServiceInformation));
            });
        });
    }

    function sendRegistration(services) {
        return new Promise((resolve, reject) => {
            var resource = constants.DEFAULT_RESOURCE;
            // Use an Undefined check since defaultResource override could be blank.
            if (config.getConfig().defaultResource !== undefined){
                resource = config.getConfig().defaultResource;
            }
            var options = {
                url: config.getConfig().iotManager.url + config.getConfig().iotManager.path,
                method: 'POST',
                json: {
                    protocol: config.getConfig().iotManager.protocol,
                    description: config.getConfig().iotManager.description,
                    iotagent: config.getConfig().providerUrl + (config.getConfig().iotManager.agentPath || ''),
                    resource: resource,
                    services: services
                },
                retry : 0
            };

            logger.debug(context, 'Sending registration to the IOTAM:\n%s\n\n', JSON.stringify(options, null, 4));
            
            got(options)
            .then (response => {
                return resolve(response.body);
            })
            .catch (error => {
                return reject(error);              
            });
           
        });

    }

    function handleRegistration(result) {
        return new Promise((resolve, reject) => {
            if (result.statusCode !== 200 && result.statusCode !== 201) {
                alarms.raise(constants.IOTAM_ALARM, 'Wrong status code connecting with the IoTAM');

                logger.error(context, 'IOTAM-001: Error updating information in the IOTAM. Status Code [%d]',
                    result.statusCode);
                return reject();
            } else {
                alarms.release(constants.IOTAM_ALARM);
                return resolve();
            }
        });
    }

    function checkConfiguration() {
        return new Promise((resolve, reject) => {
            var attributes = ['protocol', 'description'],
                missing = [];

            if (!config.getConfig().providerUrl) {
                missing.push('providerUrl');
            }

            for (var i in attributes) {
                if (!config.getConfig().iotManager[attributes[i]]) {
                    missing.push(attributes[i]);
                }
            }

            if (missing.length) {
                return reject(new errors.MissingConfigParams(missing));
            } 
            return resolve();
        });
    }

    if (config.getConfig().iotManager) {
        checkConfiguration()
        .then( () =>{
            return getServices();
        })
        .then(services => {
            return sendRegistration(services);
        })
        .then(result => {
            return handleRegistration(result);
        })
        .then(() => {
             return callback();
        })
        .catch(error => {
            logger.error(context, 'Error connecting to IoT Manager: %j', error);
            alarms.raise(constants.IOTAM_ALARM, 'Unknown error connecting with the IoTAM');
            return callback(error);
        });
    } else{
        return callback();
    }
    
}

exports.register = intoTrans(context, register);
