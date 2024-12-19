import React, { useEffect, useState } from 'react';
import { TouchableOpacity, View, Text, Platform, FlatList, PermissionsAndroid } from 'react-native';
import { BleManager, Device, Characteristic } from 'react-native-ble-plx';
import { fromByteArray, toByteArray } from 'base64-js';

// Add these UUIDs to match your ESP32 configuration
const SERVICE_UUID = "19b10000-e8f2-537e-4f6c-d104768a1214";
const CHARACTERISTIC_UUID = "19b10002-e8f2-537e-4f6c-d104768a1214";

const bleManager = new BleManager();

export default function HomeScreen() {
  const [isScanning, setIsScanning] = useState(false);
  const [devices, setDevices] = useState<Device[]>([]);
  const [connectedDevice, setConnectedDevice] = useState<Device | null>(null);
  const [receivedData, setReceivedData] = useState<string>("");
  const [isMonitoring, setIsMonitoring] = useState(false);

  const requestPermissions = async () => {
    if (Platform.OS === 'ios') {
      return true;
    }

    /*
    if (Platform.OS === 'android' && Platform.Version >= 31) {
      const result = await PermissionsAndroid.requestMultiple([
        PermissionsAndroid.PERMISSIONS.BLUETOOTH_SCAN,
        PermissionsAndroid.PERMISSIONS.BLUETOOTH_CONNECT,
      ]);

      return Object.values(result).every(
        (permission) => permission === PermissionsAndroid.RESULTS.GRANTED
      );
    } else {
      const result = await PermissionsAndroid.requestMultiple([
        PermissionsAndroid.PERMISSIONS.ACCESS_FINE_LOCATION,
      ]);

      return Object.values(result).every(
        (permission) => permission === PermissionsAndroid.RESULTS.GRANTED
      );
    }
    */
  };

  const scanForDevices = async () => {
    const hasPermissions = await requestPermissions();
    if (!hasPermissions) {
      console.log('No permissions granted');
      return;
    }

    if (!isScanning) {
      setDevices([]);
      setIsScanning(true);

      bleManager.startDeviceScan(null, null, (error, device) => {
        if (error) {
          console.log('Scan error:', error);
          return;
        }

        if (device) {
          setDevices((prevDevices) => {
            const existingDevice = prevDevices.find((d) => d.id === device.id);
            if (!existingDevice) {
              return [...prevDevices, device];
            }
            return prevDevices;
          });
        }
      });

      // Stop scanning after 5 seconds
      setTimeout(() => {
        bleManager.stopDeviceScan();
        setIsScanning(false);
      }, 5000);
    }
  };

  const cleanupConnection = async () => {
    try {
      if (isMonitoring) {
        setIsMonitoring(false);
      }
      if (connectedDevice) {
        await connectedDevice.cancelConnection();
        setConnectedDevice(null);
        setReceivedData("");
      }
    } catch (error) {
      console.log('Cleanup error:', error);
    }
  };

  const connectToDevice = async (deviceId: string) => {
    try {
      // Cleanup any existing connection first
      await cleanupConnection();

      const device = await bleManager.connectToDevice(deviceId);
      console.log("Connected to device:", device.name);
      
      const discoveredDevice = await device.discoverAllServicesAndCharacteristics();
      console.log("Services and characteristics discovered");
      
      const services = await discoveredDevice.services();
      console.log("Available services:", services.map(s => s.uuid));
      
      const service = services.find(service => service.uuid === SERVICE_UUID.toLowerCase());
      if (!service) {
        console.log("Service not found");
        return;
      }
      
      const characteristics = await service.characteristics();
      console.log("Available characteristics:", characteristics.map(c => c.uuid));
      
      const characteristic = characteristics.find(char => char.uuid === CHARACTERISTIC_UUID.toLowerCase());
      if (!characteristic) {
        console.log("Characteristic not found");
        return;
      }

      setConnectedDevice(device);

      // Start monitoring only if not already monitoring
      if (!isMonitoring) {
        setIsMonitoring(true);
        
        device.monitorCharacteristicForService(
          SERVICE_UUID,
          CHARACTERISTIC_UUID,
          async (error, characteristic) => {
            if (error) {
              console.log(error.name, error.reason);
              setIsMonitoring(false);
              return;
            }
            
            if (characteristic?.value) {
              const base64Value = characteristic.value;
              try{
                const byteArray = toByteArray(base64Value);
                const letter = new TextDecoder().decode(new Uint8Array(byteArray));
                console.log(letter)
                //return new TextDecoder().decode(new Uint8Array(byteArray));
              }catch(error){
                console.log(error)
              }
              //console.log(base64Value);
              //
              //const numberValue = parseInt(decodedString, 10);  // Convert to number
              //console.log('Number value:', numberValue);  // Will print: 73
              //setReceivedData(decodedString);
            }
          }
        );
      }
      
    } catch (error) {
      console.log('Connection error:', error);
      await cleanupConnection();
      throw error;
    }
  };

  const sendData = async (data: string) => {
    if (!connectedDevice) {
      console.log('No device connected');
      return;
    }

    try {
      const encoder = new TextEncoder();
      const uint8Array = encoder.encode(data);
      const base64Data = fromByteArray(uint8Array);
      
      console.log('Sending data:', data);
      console.log('Base64 encoded:', base64Data);
      
      await connectedDevice.writeCharacteristicWithResponseForService(
        SERVICE_UUID,
        CHARACTERISTIC_UUID,
        base64Data
      );

    } catch (error) {
      console.log('Send data error:', error);
    }
  };

  // Handle disconnection
  useEffect(() => {
    if (connectedDevice) {
      connectedDevice.onDisconnected((error, device) => {
        console.log('Device disconnected:', device?.name);
        cleanupConnection();
      });
    }
  }, [connectedDevice]);

  // Cleanup on component unmount
  useEffect(() => {
    return () => {
      cleanupConnection().then(() => {
        bleManager.destroy();
      });
    };
  }, []);

  const renderDevice = ({ item }: { item: Device }) => {
    if (item.localName !== 'LVMP:') {
      return null;
    }

    return (
      <TouchableOpacity 
        style={{
          height: 40,
          padding: 10,
          backgroundColor: connectedDevice?.id === item.id ? '#e0e0e0' : 'red',
          marginVertical: 5,
          borderRadius: 5,
        }}
        onPress={() => connectToDevice(item.id)}>
        <Text style={{color: "black"}}>
          {item.localName}
        </Text>
        {connectedDevice?.id === item.id && (
          <Text style={{color: "green", fontSize: 12}}>Connected</Text>
        )}
      </TouchableOpacity>
    );
  };

  return (
    <View style={{
      flex: 1,
      padding: 20,
    }}>
      <TouchableOpacity
        onPress={scanForDevices}
        style={{
          backgroundColor: "blue",
          padding: 10,
          borderRadius: 5,
          marginBottom: 20,
        }}>
        <Text style={{color: "white", textAlign: 'center'}}>
          {isScanning ? 'Scanning...' : 'Scan for Devices'}
        </Text>
      </TouchableOpacity>

      <FlatList
        data={devices}
        renderItem={renderDevice}
        keyExtractor={item => item.id}
        style={{marginBottom: 20}}
      />

      {connectedDevice && (
        <View style={{padding: 10, backgroundColor: '#f5f5f5', borderRadius: 5}}>
          <Text style={{color: 'black', marginBottom: 10}}>
            Connected to: {connectedDevice.name}
          </Text>

          <TouchableOpacity
            onPress={() => {
                sendData(`{ status: "on",  }`)
              }
            }>
            <Text style={{color: 'black', marginBottom: 10}}>
              send
            </Text>
          </TouchableOpacity>
        </View>
      )}
    </View>
  );
}