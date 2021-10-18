'use-strict';

const ffmpegPath = require('ffmpeg-for-homebridge');
const fs = require('fs-extra');

const config = require('./config.service');
const logger = require('../logger/logger.service');

class ConfigSetup {
  constructor() {
    this.ui = this._ui();
    this.options = this._options();
    this.hsv = this._hsv();
    this.prebuffering = this._prebuffering();
    this.ssl = this._ssl();
    this.mqtt = this._mqtt();
    this.mqttConfigs = this._mqttConfigs();
    this.http = this._http();
    this.smtp = this._smtp();
    this.cameras = this._cameras();

    return {
      ...this.ui,
      ui: config.ui,
      hsv: this.hsv,
      prebuffering: this.prebuffering,
      options: this.options,
      ssl: this.ssl,
      http: this.http,
      smtp: this.smtp,
      mqtt: this.mqtt,
      mqttConfigs: this.mqttConfigs,
      cameras: this.cameras,
    };
  }

  _ui() {
    const ui = {
      debug: config.plugin.debug,
      port: config.plugin.port || 8181,
      language: config.plugin.language || 'auto',
      theme: config.plugin.theme || 'auto',
      atHomeSwitch: config.plugin.atHomeSwitch || false,
    };

    return ui;
  }

  _hsv() {
    const hsv = {
      active: (config.plugin.cameras || []).some(
        (camera) => camera.name && camera.videoConfig && camera.videoConfig.source && camera.hsv
      ),
      fragmentLength: 4000,
    };

    return hsv;
  }

  _prebuffering() {
    const prebuffering = {
      active: config.plugin.options && config.plugin.options.prebuffering,
      videoDuration: 20000,
      prebufferLength: 4000,
    };

    return prebuffering;
  }

  _options() {
    const options = {
      videoProcessor:
        config.plugin.options && config.plugin.options.videoProcessor
          ? config.plugin.options.videoProcessor
          : ffmpegPath || 'ffmpeg',
    };

    return options;
  }

  _ssl() {
    if (config.plugin.ssl && config.plugin.ssl.active && config.plugin.ssl.key && config.plugin.ssl.cert) {
      try {
        const ssl = {
          key: fs.readFileSync(config.plugin.ssl.key, 'utf8'),
          cert: fs.readFileSync(config.plugin.ssl.cert, 'utf8'),
        };

        return ssl;
      } catch (error) {
        logger.warn('WARNING: Could not read SSL Cert/Key');
        logger.debug(error);
      }
    }

    return false;
  }

  _mqtt() {
    const mqtt = {
      active: config.plugin.mqtt && config.plugin.mqtt.active && config.plugin.mqtt.host,
      tls: config.plugin.mqtt && config.plugin.mqtt.tls,
      host: config.plugin.mqtt && config.plugin.mqtt.host ? config.plugin.mqtt.host : false,
      port: config.plugin.mqtt && !Number.isNaN(config.plugin.mqtt.port) ? config.plugin.mqtt.port : 1883,
      username: config.plugin.mqtt && config.plugin.mqtt.username ? config.plugin.mqtt.username : '',
      password: config.plugin.mqtt && config.plugin.mqtt.password ? config.plugin.mqtt.password : '',
    };

    return mqtt;
  }

  _mqttConfigs() {
    const mqttConfigs = new Map();
    const cameras = this._cameras();

    for (const camera of cameras) {
      if (camera.mqtt && this.mqtt.active) {
        //setup mqtt topics
        if (camera.mqtt.motionTopic) {
          const mqttOptions = {
            motionTopic: camera.mqtt.motionTopic,
            motionMessage: camera.mqtt.motionMessage || 'ON',
            motionResetMessage: camera.mqtt.motionResetMessage || 'OFF',
            camera: camera.name,
            motion: true,
          };

          mqttConfigs.set(mqttOptions.motionTopic, mqttOptions);
        }

        if (camera.mqtt.motionResetTopic && camera.mqtt.motionResetTopic !== camera.mqtt.motionTopic) {
          const mqttOptions = {
            motionResetTopic: camera.mqtt.motionResetTopic,
            motionResetMessage: camera.mqtt.motionResetMessage || 'OFF',
            camera: camera.name,
            motion: true,
            reset: true,
          };

          mqttConfigs.set(mqttOptions.motionResetTopic, mqttOptions);
        }

        if (
          camera.mqtt.doorbellTopic &&
          camera.mqtt.doorbellTopic !== camera.mqtt.motionTopic &&
          camera.mqtt.doorbellTopic !== camera.mqtt.motionResetTopic
        ) {
          const mqttOptions = {
            doorbellTopic: camera.mqtt.doorbellTopic,
            doorbellMessage: camera.mqtt.doorbellMessage || 'ON',
            camera: camera.name,
            doorbell: true,
          };

          mqttConfigs.set(mqttOptions.doorbellTopic, mqttOptions);
        }
      }
    }

    return mqttConfigs;
  }

  _http() {
    const http = {
      active: config.plugin.http && config.plugin.http.active,
      port: config.plugin.http && !Number.isNaN(config.plugin.http.port) ? config.plugin.http.port : 7777,
      localhttp: config.plugin.http && config.plugin.http.localhttp,
    };

    return http;
  }

  _smtp() {
    const smtp = {
      active: config.plugin.smtp && config.plugin.smtp.active,
      port: config.plugin.smtp && !Number.isNaN(config.plugin.smtp.port) ? config.plugin.smtp.port : 2525,
      space_replace: config.plugin.smtp && config.plugin.smtp.space_replace ? config.plugin.smtp.space_replace : '+',
    };

    return smtp;
  }

  _cameras() {
    const cameras = (config.plugin.cameras || [])
      .filter((camera) => camera.name && camera.videoConfig && camera.videoConfig.source)
      .map((camera) => {
        const sourceArguments = camera.videoConfig.source.split(/\s+/);

        if (!sourceArguments.includes('-i')) {
          logger.warn('The source for this camera is missing "-i", it is likely misconfigured.', camera.name);
          camera.videoConfig.source = false;
        } /* else if (!sourceArguments.includes('-stimeout')) {
          camera.videoConfig.source = camera.videoConfig.source.replace('-i', '-stimeout 10000000 -i');
        }*/

        if (camera.videoConfig.stimeout > 0 && !sourceArguments.includes('-stimeout')) {
          if (sourceArguments.includes('-re')) {
            camera.videoConfig.source = camera.videoConfig.source.replace(
              '-re',
              `-stimeout ${camera.videoConfig.stimeout * 10000000} -re` //-stimeout is in micro seconds
            );
          } else if (sourceArguments.includes('-i')) {
            camera.videoConfig.source = camera.videoConfig.source.replace(
              '-i',
              `-stimeout ${camera.videoConfig.stimeout * 10000000} -i` //-stimeout is in micro seconds
            );
          }
        }

        if (camera.videoConfig.stillImageSource) {
          const stillArguments = camera.videoConfig.stillImageSource.split(/\s+/);
          if (!stillArguments.includes('-i')) {
            logger.warn(
              'The stillImageSource for this camera is missing "-i", it is likely misconfigured.',
              camera.name
            );
            camera.videoConfig.stillImageSource = false;
          }
        }

        //Amazon Rekognition
        if (camera.rekognition) {
          camera.rekognition = {
            active: camera.rekognition.active || false,
            confidence: camera.rekognition.confidence > 0 ? camera.rekognition.confidence : 90,
            labels:
              camera.rekognition.labels && camera.rekognition.labels.length > 0
                ? camera.rekognition.labels.map((label) => label && label.toLowerCase()).filter((label) => label)
                : ['human', 'person', 'face'],
          };
        }

        //HSV
        camera.videoConfig = {
          ...camera.videoConfig,
          hsv: this.hsv,
          prebuffering: this.prebuffering,
        };

        if (!camera.hsv) {
          camera.videoConfig.hsv.active = false;
        }

        return camera;
      })
      .filter((camera) => camera.videoConfig.source);

    return cameras;
  }
}

module.exports = ConfigSetup;
