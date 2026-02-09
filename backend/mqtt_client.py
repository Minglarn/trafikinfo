import paho.mqtt.client as mqtt
import json
import logging

logger = logging.getLogger(__name__)

class MQTTClient:
    def __init__(self):
        self.client = mqtt.Client()
        self.config = {
            "host": "localhost",
            "port": 1883,
            "username": "",
            "password": "",
            "topic": "trafikinfo/events"
        }
        self.connected = False

    def update_config(self, new_config):
        self.config.update(new_config)
        self.reconnect()

    def reconnect(self):
        try:
            if self.connected:
                self.client.disconnect()
            
            if self.config["username"]:
                self.client.username_pw_set(self.config["username"], self.config["password"])
            
            self.client.connect(self.config["host"], self.config["port"], 60)
            self.client.loop_start()
            self.connected = True
            logger.info(f"Connected to MQTT broker at {self.config['host']}")
        except Exception as e:
            logger.error(f"Failed to connect to MQTT: {e}")
            self.connected = False

    def publish_event(self, event_data):
        if not self.connected:
            logger.warning("MQTT not connected, skipping publish")
            return False
        
        try:
            payload = json.dumps(event_data)
            self.client.publish(self.config["topic"], payload)
            return True
        except Exception as e:
            logger.error(f"Failed to publish to MQTT: {e}")
            return False

mqtt_client = MQTTClient()
