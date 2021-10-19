'use-strict';

const mqtt = require('mqtt');

const logger = require('../logger/logger.service');

const pluginHandler = require('../../plugin/services/handler.service');
const uiHandler = require('../../server/services/handler.service');

class Mqtt {
  start(config) {
    const mqttConfigs = config.mqttConfigs;

    const port = config.mqtt.port || '1883';
    const tls = config.mqtt.tls || false;

    logger.debug('Setting up MQTT connection for motion detection...', false, '[MQTT]');

    const client = mqtt.connect((tls ? 'mqtts://' : 'mqtt://') + config.mqtt.host + ':' + port, {
      username: config.mqtt.username,
      password: config.mqtt.password,
    });

    client.on('connect', () => {
      logger.debug('MQTT connected', false, '[MQTT]');

      for (const [topic] of mqttConfigs) {
        logger.debug(`Subscribing to MQTT topic: ${topic}`, false, '[MQTT]');
        client.subscribe(topic + '/#');
      }
    });

    client.on('message', (topic, message) => {
      logger.debug(`Received a new MQTT message ${message.toString()} (${topic})`, false, '[MQTT]');

      const cameraMqttConfig = mqttConfigs.get(topic);

      if (cameraMqttConfig) {
        message = message.toString();

        let name = cameraMqttConfig.camera;
        let target = cameraMqttConfig.motion ? 'motion' : 'doorbell';

        let active =
          target === 'doorbell'
            ? true
            : cameraMqttConfig.reset
            ? message === cameraMqttConfig.motionResetMessage
              ? false
              : undefined
            : message === cameraMqttConfig.motionMessage
            ? true
            : message === cameraMqttConfig.motionResetMessage
            ? false
            : undefined;

        if (active !== undefined) {
          const camera = config.cameras.find((camera) => camera && camera.name === name);

          pluginHandler.handle(target, name, active);

          if (active && (!camera || (camera && !camera.hsv))) {
            uiHandler.handle(target, name, active);
          }
        } else {
          logger.warn(
            `The incoming MQTT message (${message}) for the topic (${topic}) was not the same as set in config.json. Skip...`,
            false,
            '[MQTT]'
          );
        }
      } else {
        logger.warn(`Can not assign the MQTT topic (${topic}) to a camera!`, false, '[MQTT]');
      }
    });
  }
}

module.exports = new Mqtt();
