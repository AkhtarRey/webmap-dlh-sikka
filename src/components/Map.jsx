// Map.jsx
import React, { useState, useEffect } from 'react';
import { MapContainer, TileLayer, GeoJSON, Marker, Popup } from 'react-leaflet';
import 'leaflet/dist/leaflet.css'; // Import CSS Leaflet
import L from 'leaflet'; // Impor Leaflet untuk membuat ikon kustom
import { db, rtdb } from '../firebase'; // Impor Firestore dan Realtime Database
import { collection, addDoc, getDocs, deleteDoc, doc, getDoc } from 'firebase/firestore'; // Firestore functions
import { ref, set, onValue } from 'firebase/database'; // Realtime Database functions

const Map = () => {
  // Koordinat default (contoh: Jakarta)
  const position = [-7.413498755605227, 108.8990231887274];
  const [baseLayer, setBaseLayer] = useState('street'); // Default ke Street (OSM)
  const [showModal, setShowModal] = useState(false); // State untuk modal upload
  const [layerName, setLayerName] = useState(''); // State untuk nama layer
  const [geojsonFile, setGeojsonFile] = useState(null); // State untuk file GeoJSON
  const [layerColor, setLayerColor] = useState('#ff0000'); // State untuk warna layer (default: merah)
  const [layers, setLayers] = useState([]); // State untuk menyimpan layer dari Firestore
  const [visibleLayers, setVisibleLayers] = useState({}); // State untuk melacak layer yang aktif
  const [showSidebar, setShowSidebar] = useState(false); // State untuk membuka/menutup sidebar
  const [drivers, setDrivers] = useState({}); // State untuk menyimpan lokasi sopir
  const [watchId, setWatchId] = useState(null);

  // State untuk login
  const [isLoggedIn, setIsLoggedIn] = useState(() => {
    return localStorage.getItem('isLoggedIn') === 'true';
  }); // Status login
  const [showLoginModal, setShowLoginModal] = useState(false); // Modal login (default: false)
  const [username, setUsername] = useState(''); // Input username
  const [password, setPassword] = useState(''); // Input password
  const [loginError, setLoginError] = useState(''); // Pesan error login
  const [userData, setUserData] = useState(() => {
    const savedUserData = localStorage.getItem('userData');
    return savedUserData ? JSON.parse(savedUserData) : null;
  }); // Data pengguna setelah login

  // Ikon kustom untuk marker GeoJSON
  const createCustomMarkerIcon = (color) => {
    return L.divIcon({
      className: 'custom-marker',
      html: `
        <div style="
          background-color: ${color};
          width: 12px;
          height: 12px;
          border-radius: 50%;
          border: 2px solid #fff;
          box-shadow: 0 0 5px rgba(0,0,0,0.3);
        "></div>
      `,
      iconSize: [12, 12],
      iconAnchor: [6, 6],
    });
  };

  // Ikon kustom untuk marker sopir
  const driverIcon = L.divIcon({
    className: 'driver-marker',
    html: `
      <div style="
        background-color: #00ff00;
        width: 20px;
        height: 20px;
        border-radius: 50%;
        border: 2px solid #fff;
        box-shadow: 0 0 5px rgba(0,0,0,0.3);
      "></div>
    `,
    iconSize: [20, 20],
    iconAnchor: [10, 10],
  });

  // Fungsi untuk menentukan jenis geometri dari GeoJSON
  const getGeometryType = (geojson) => {
    if (!geojson || !geojson.features || geojson.features.length === 0) {
      return 'unknown';
    }
    const featureType = geojson.features[0].geometry.type;
    if (featureType.includes('Point')) return 'point';
    if (featureType.includes('LineString')) return 'line';
    if (featureType.includes('Polygon')) return 'polygon';
    return 'unknown';
  };

  // Fungsi untuk menampilkan modal login
  const toggleLoginModal = () => {
    setShowLoginModal(!showLoginModal);
    setLoginError(''); // Reset pesan error saat modal dibuka/ditutup
    setUsername(''); // Reset form
    setPassword('');
  };

  // Fungsi untuk login
  const handleLogin = async (e) => {
    e.preventDefault();
    setLoginError('');
    try {
      const userRef = doc(db, 'users', username);
      const userSnap = await getDoc(userRef);
      if (userSnap.exists()) {
        const userData = userSnap.data();
        if (userData.password === password) {
          setIsLoggedIn(true);
          setShowLoginModal(false);
          setUserData({ username, role: userData.role });
          // Simpan ke localStorage
          localStorage.setItem('isLoggedIn', 'true');
          localStorage.setItem('userData', JSON.stringify({ username, role: userData.role }));
          setUsername('');
          setPassword('');
          if (userData.role === 'sopir') {
            startTrackingLocation(username);
          }
        } else {
          setLoginError('Password salah!');
        }
      } else {
        setLoginError('Username tidak ditemukan!');
      }
    } catch (error) {
      console.error('Error during login:', error);
      setLoginError('Gagal login. Cek konsol untuk detail error.');
    }
  };

  // Fungsi untuk logout
  const handleLogout = () => {
    if (userData?.role === 'sopir' && watchId !== null) {
      navigator.geolocation.clearWatch(watchId);
      setWatchId(null);
      const driverRef = ref(rtdb, `drivers/${userData.username}`);
      set(driverRef, null)
        .then(() => {
          setDrivers((prev) => {
            const updatedDrivers = { ...prev };
            delete updatedDrivers[userData.username];
            return updatedDrivers;
          });
          console.log('Driver location removed from database and state');
        })
        .catch((error) => {
          console.error('Error removing driver location:', error);
        });
    }
    setIsLoggedIn(false);
    setUserData(null);
    localStorage.removeItem('isLoggedIn');
    localStorage.removeItem('userData');
  
    // Reload PWA untuk memastikan semua proses dihentikan
    if ('serviceWorker' in navigator) {
      navigator.serviceWorker.getRegistration().then((registration) => {
        if (registration) {
          registration.unregister().then(() => {
            console.log('Service worker unregistered');
            window.location.reload(true); // Force reload tanpa cache
          });
        } else {
          window.location.reload(true);
        }
      });
    } else {
      window.location.reload(true);
    }
  };

  // Fungsi untuk melacak lokasi sopir
  const startTrackingLocation = (username) => {
    if (navigator.geolocation) {
      const id = navigator.geolocation.watchPosition(
        (position) => {
          const { latitude, longitude } = position.coords;
          const timestamp = new Date().toISOString();
          const driverRef = ref(rtdb, `drivers/${username}`);
          set(driverRef, { latitude, longitude, timestamp }).catch((error) => {
            console.error('Error updating driver location:', error);
          });
        },
        (error) => {
          console.error('Error getting location:', error);
          alert('Gagal melacak lokasi. Pastikan izin lokasi diaktifkan.');
        },
        { enableHighAccuracy: true, timeout: 5000, maximumAge: 0 }
      );
      setWatchId(id); // Simpan ID watchPosition
    } else {
      alert('Geolocation tidak didukung oleh browser Anda.');
    }
  };

  useEffect(() => {
    if (isLoggedIn && userData?.role === 'sopir') {
      startTrackingLocation(userData.username);
    }
  }, [isLoggedIn, userData]);

  // Fungsi untuk mengambil data dari Firestore (layer GeoJSON)
  useEffect(() => {
    const fetchLayers = async () => {
      try {
        const geojsonRef = collection(db, 'geojson_layers');
        const querySnapshot = await getDocs(geojsonRef);
        const fetchedLayers = querySnapshot.docs.map((doc) => {
          const data = doc.data();
          const geojsonData = JSON.parse(data.data);
          return {
            id: doc.id,
            data: geojsonData,
            color: data.color,
            name: data.name,
            geometryType: getGeometryType(geojsonData),
          };
        });
        setLayers(fetchedLayers);

        const initialVisibleLayers = {};
        fetchedLayers.forEach((layer) => {
          initialVisibleLayers[layer.id] = true;
        });
        setVisibleLayers(initialVisibleLayers);
      } catch (error) {
        console.error('Error fetching layers from Firestore:', error);
      }
    };

    fetchLayers();
  }, []);

  // Fungsi untuk mendengarkan perubahan lokasi sopir dari Realtime Database
  useEffect(() => {
    const driversRef = ref(rtdb, 'drivers');
    const unsubscribe = onValue(driversRef, (snapshot) => {
      const data = snapshot.val();
      setDrivers(data || {});
    });

    // Cleanup saat komponen unmount
    return () => unsubscribe();
  }, []);

  // Fungsi untuk mengganti basemap
  const handleBaseLayerChange = (layer) => {
    setBaseLayer(layer);
  };

  // Fungsi untuk membuka/tutup modal upload
  const toggleModal = () => {
    setShowModal(!showModal);
    if (showModal) {
      setLayerName('');
      setGeojsonFile(null);
      setLayerColor('#ff0000');
    }
  };

  // Fungsi untuk membuka/tutup sidebar
  const toggleSidebar = () => {
    setShowSidebar(!showSidebar);
  };

  // Fungsi untuk menangani upload GeoJSON
  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!layerName || !geojsonFile) {
      alert('Harap isi nama layer dan pilih file GeoJSON!');
      return;
    }

    try {
      const reader = new FileReader();
      reader.onload = async (e) => {
        const geojsonData = JSON.parse(e.target.result);
        const geojsonString = JSON.stringify(geojsonData);

        const geojsonRef = collection(db, 'geojson_layers');
        const docRef = await addDoc(geojsonRef, {
          name: layerName,
          data: geojsonString,
          color: layerColor,
          createdAt: new Date(),
        });

        const newLayer = {
          id: docRef.id,
          data: geojsonData,
          color: layerColor,
          name: layerName,
          geometryType: getGeometryType(geojsonData),
        };
        setLayers((prev) => [...prev, newLayer]);

        setVisibleLayers((prev) => ({
          ...prev,
          [docRef.id]: true,
        }));

        alert('GeoJSON berhasil diunggah ke Firestore!');
        toggleModal();
      };
      reader.readAsText(geojsonFile);
    } catch (error) {
      console.error('Error uploading GeoJSON to Firestore:', error);
      alert('Gagal mengunggah GeoJSON. Cek konsol untuk detail error.');
    }
  };

  // Fungsi untuk toggle visibilitas layer
  const toggleLayerVisibility = (layerId) => {
    setVisibleLayers((prev) => ({
      ...prev,
      [layerId]: !prev[layerId],
    }));
  };

  // Fungsi untuk menghapus layer
  const deleteLayer = async (layerId) => {
    try {
      const layerRef = doc(db, 'geojson_layers', layerId);
      await deleteDoc(layerRef);

      setLayers((prev) => prev.filter((layer) => layer.id !== layerId));
      setVisibleLayers((prev) => {
        const updated = { ...prev };
        delete updated[layerId];
        return updated;
      });

      alert('Layer berhasil dihapus!');
    } catch (error) {
      console.error('Error deleting layer from Firestore:', error);
      alert('Gagal menghapus layer. Cek konsol untuk detail error.');
    }
  };

  return (
    <div style={{ position: 'relative', height: '100vh', width: '100vw' }}>
      {/* Modal Login */}
      {showLoginModal && (
        <div
          style={{
            position: 'fixed',
            top: 0,
            left: 0,
            height: '100vh',
            width: '100vw',
            backgroundColor: 'rgba(0,0,0,0.5)',
            display: 'flex',
            justifyContent: 'center',
            alignItems: 'center',
            zIndex: 2000,
          }}
        >
          <div
            style={{
              backgroundColor: '#fff',
              padding: '20px',
              borderRadius: '8px',
              width: '350px',
              maxWidth: '90%',
              boxShadow: '0 2px 10px rgba(0,0,0,0.3)',
            }}
          >
            <h2 style={{ margin: '0 0 20px 0', fontSize: '20px', textAlign: 'center' }}>
              Login
            </h2>
            <form onSubmit={handleLogin}>
              <div style={{ marginBottom: '15px' }}>
                <label
                  htmlFor="username"
                  style={{ display: 'block', marginBottom: '5px' }}
                >
                  Username
                </label>
                <input
                  type="text"
                  id="username"
                  value={username}
                  onChange={(e) => setUsername(e.target.value)}
                  style={{
                    width: '100%',
                    padding: '8px',
                    border: '1px solid #ccc',
                    borderRadius: '4px',
                    boxSizing: 'border-box',
                  }}
                  placeholder="Masukkan username"
                  required
                />
              </div>
              <div style={{ marginBottom: '15px' }}>
                <label
                  htmlFor="password"
                  style={{ display: 'block', marginBottom: '5px' }}
                >
                  Password
                </label>
                <input
                  type="password"
                  id="password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  style={{
                    width: '100%',
                    padding: '8px',
                    border: '1px solid #ccc',
                    borderRadius: '4px',
                    boxSizing: 'border-box',
                  }}
                  placeholder="Masukkan password"
                  required
                />
              </div>
              {loginError && (
                <p style={{ color: 'red', fontSize: '14px', margin: '0 0 15px 0' }}>
                  {loginError}
                </p>
              )}
              <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                <button
                  type="button"
                  onClick={toggleLoginModal}
                  style={{
                    padding: '8px 16px',
                    backgroundColor: '#dc3545',
                    color: '#fff',
                    border: 'none',
                    borderRadius: '4px',
                    cursor: 'pointer',
                    fontSize: '14px',
                  }}
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  style={{
                    padding: '8px 16px',
                    backgroundColor: '#28a745',
                    color: '#fff',
                    border: 'none',
                    borderRadius: '4px',
                    cursor: 'pointer',
                    fontSize: '14px',
                    fontWeight: 'bold',
                  }}
                >
                  Login
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Peta dan fitur lainnya (tidak perlu login) */}
      <>
        <MapContainer
          center={position}
          zoom={13}
          zoomControl={false}
          attributionControl={false}
          style={{ height: '100%', width: '100%' }}
        >
          {/* Basemap Street (OpenStreetMap) */}
          {baseLayer === 'street' && (
            <TileLayer
              attribution='© <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
              url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
            />
          )}

          {/* Basemap Satellite */}
          {baseLayer === 'satellite' && (
            <TileLayer
              attribution='© <a href="https://www.esri.com/">Esri</a>'
              url="https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}"
            />
          )}

          {/* Tampilkan layer GeoJSON yang aktif */}
          {layers.map((layer) =>
            visibleLayers[layer.id] ? (
              <GeoJSON
                key={layer.id}
                data={layer.data}
                style={() => ({
                  color: layer.color,
                  weight: 2,
                  opacity: 0.8,
                  fillOpacity: 0.4,
                })}
                pointToLayer={(feature, latlng) => {
                  return L.marker(latlng, {
                    icon: createCustomMarkerIcon(layer.color),
                  });
                }}
              />
            ) : null
          )}

          {/* Tampilkan marker untuk setiap sopir */}
          {Object.entries(drivers).map(([driverUsername, data]) => (
            data.latitude && data.longitude ? (
              <Marker
                key={driverUsername}
                position={[data.latitude, data.longitude]}
                icon={driverIcon}
              >
                <Popup>
                  Sopir: {driverUsername}
                  <br />
                  Terakhir diperbarui: {new Date(data.timestamp).toLocaleTimeString()}
                </Popup>
              </Marker>
            ) : null
          ))}
        </MapContainer>

        {/* Tombol toggle berdampingan */}
        <div
          style={{
            position: 'absolute',
            bottom: '20px',
            right: '20px',
            zIndex: 1000,
            display: 'flex',
            gap: '0px',
            borderRadius: '8px',
            overflow: 'hidden',
            boxShadow: '0 2px 5px rgba(0,0,0,0.2)',
          }}
        >
          <button
            onClick={() => handleBaseLayerChange('satellite')}
            style={{
              padding: '10px 20px',
              backgroundColor: baseLayer === 'satellite' ? '#ffd700' : '#f0f0f0',
              color: '#333',
              border: 'none',
              cursor: 'pointer',
              fontSize: '14px',
              fontWeight: 'bold',
              outline: 'none',
              transition: 'background-color 0.3s',
            }}
          >
            Satellite
          </button>
          <button
            onClick={() => handleBaseLayerChange('street')}
            style={{
              padding: '10px 20px',
              backgroundColor: baseLayer === 'street' ? '#ffd700' : '#f0f0f0',
              color: '#333',
              border: 'none',
              cursor: 'pointer',
              fontSize: '14px',
              fontWeight: 'bold',
              outline: 'none',
              transition: 'background-color 0.3s',
            }}
          >
            Street
          </button>
        </div>

        {/* Tombol Upload (hanya untuk admin yang sudah login) */}
        {isLoggedIn && userData?.role === 'admin' && (
          <button
            onClick={toggleModal}
            style={{
              position: 'absolute',
              top: '20px',
              right: '20px',
              zIndex: 1000,
              padding: '10px 20px',
              backgroundColor: '#007bff',
              color: '#fff',
              border: 'none',
              borderRadius: '4px',
              cursor: 'pointer',
              fontSize: '14px',
              fontWeight: 'bold',
            }}
          >
            Upload GeoJSON
          </button>
        )}

        {/* Tombol Login/Logout */}
        <button
          onClick={isLoggedIn ? handleLogout : toggleLoginModal}
          style={{
            position: 'absolute',
            top: '20px',
            left: '150px', // Digeser ke kanan agar tidak bertabrakan dengan tombol "Show Layers"
            zIndex: '1000',
            padding: '10px 15px',
            backgroundColor: isLoggedIn ? '#dc3545' : '#007bff',
            color: '#fff',
            border: 'none',
            borderRadius: '4px',
            cursor: 'pointer',
            fontSize: '14px',
            fontWeight: 'bold',
          }}
        >
          {isLoggedIn ? 'Logout' : 'Login'}
        </button>

        {/* Tombol Toggle Sidebar */}
        <button
          onClick={toggleSidebar}
          style={{
            position: 'absolute',
            top: '20px',
            left: '20px',
            zIndex: 1000,
            padding: '10px 15px',
            backgroundColor: '#fff',
            border: '1px solid #ccc',
            borderRadius: '4px',
            cursor: 'pointer',
            fontSize: '14px',
            fontWeight: 'bold',
          }}
        >
          {showSidebar ? 'Hide Layers' : 'Show Layers'}
        </button>

        {/* Sidebar untuk Layer Control */}
        {showSidebar && (
          <div
            style={{
              position: 'absolute',
              top: '70px',
              left: '20px',
              zIndex: 1000,
              backgroundColor: '#fff',
              padding: '15px',
              borderRadius: '8px',
              boxShadow: '0 2px 10px rgba(0,0,0,0.3)',
              width: '250px',
              maxHeight: '70vh',
              overflowY: 'auto',
            }}
          >
            <h3 style={{ margin: '0 0 15px 0', fontSize: '16px' }}>Layer Control</h3>
            {layers.length === 0 ? (
              <p style={{ color: '#666', fontSize: '14px' }}>No layers available</p>
            ) : (
              layers.map((layer) => (
                <div
                  key={layer.id}
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    marginBottom: '10px',
                  }}
                >
                  <input
                    type="checkbox"
                    checked={visibleLayers[layer.id] || false}
                    onChange={() => toggleLayerVisibility(layer.id)}
                    style={{ marginRight: '10px' }}
                  />
                  <span style={{ fontSize: '14px', flex: 1 }}>{layer.name}</span>
                  <div
                    style={{
                      marginLeft: '10px',
                      width: layer.geometryType === 'line' ? '20px' : '14px',
                      height: layer.geometryType === 'line' ? '4px' : '14px',
                      backgroundColor: layer.color,
                      border: '1px solid #ccc',
                      borderRadius: layer.geometryType === 'point' ? '50%' : layer.geometryType === 'line' ? '0' : '3px',
                    }}
                  ></div>
                  {/* Tombol Delete (hanya untuk admin yang sudah login) */}
                  {isLoggedIn && userData?.role === 'admin' && (
                    <button
                      onClick={() => deleteLayer(layer.id)}
                      style={{
                        marginLeft: '10px',
                        padding: '2px 6px',
                        backgroundColor: '#dc3545',
                        color: '#fff',
                        border: 'none',
                        borderRadius: '3px',
                        cursor: 'pointer',
                        fontSize: '12px',
                        lineHeight: '1',
                      }}
                      title="Delete layer"
                    >
                      X
                    </button>
                  )}
                </div>
              ))
            )}
          </div>
        )}

        {/* Modal untuk form upload (hanya untuk admin yang sudah login) */}
        {showModal && isLoggedIn && userData?.role === 'admin' && (
          <div
            style={{
              position: 'fixed',
              top: 0,
              left: 0,
              height: '100vh',
              width: '100vw',
              backgroundColor: 'rgba(0,0,0,0.5)',
              display: 'flex',
              justifyContent: 'center',
              alignItems: 'center',
              zIndex: 2000,
            }}
          >
            <div
              style={{
                backgroundColor: '#fff',
                padding: '20px',
                borderRadius: '8px',
                width: '400px',
                maxWidth: '90%',
                boxShadow: '0 2px 10px rgba(0,0,0,0.3)',
              }}
            >
              <h2 style={{ margin: '0 0 20px 0', fontSize: '20px' }}>
                Upload GeoJSON Layer
              </h2>
              <form onSubmit={handleSubmit}>
                {/* Nama Layer */}
                <div style={{ marginBottom: '15px' }}>
                  <label
                    htmlFor="layerName"
                    style={{ display: 'block', marginBottom: '5px' }}
                  >
                    Nama Layer
                  </label>
                  <input
                    type="text"
                    id="layerName"
                    value={layerName}
                    onChange={(e) => setLayerName(e.target.value)}
                    style={{
                      width: '100%',
                      padding: '8px',
                      border: '1px solid #ccc',
                      borderRadius: '4px',
                      boxSizing: 'border-box',
                    }}
                    placeholder="Masukkan nama layer"
                    required
                  />
                </div>

                {/* Pilih File GeoJSON */}
                <div style={{ marginBottom: '15px' }}>
                  <label
                    htmlFor="geojsonFile"
                    style={{ display: 'block', marginBottom: '5px' }}
                  >
                    Pilih File GeoJSON
                  </label>
                  <input
                    type="file"
                    id="geojsonFile"
                    accept=".geojson,application/geo+json"
                    onChange={(e) => setGeojsonFile(e.target.files[0])}
                    style={{
                      width: '100%',
                      padding: '8px 0',
                    }}
                    required
                  />
                </div>

                {/* Pilih Warna */}
                <div style={{ marginBottom: '20px' }}>
                  <label
                    htmlFor="layerColor"
                    style={{ display: 'block', marginBottom: '5px' }}
                  >
                    Pilih Warna Layer
                  </label>
                  <input
                    type="color"
                    id="layerColor"
                    value={layerColor}
                    onChange={(e) => setLayerColor(e.target.value)}
                    style={{
                      width: '100%',
                      padding: '5px',
                      border: '1px solid #ccc',
                      borderRadius: '4px',
                    }}
                  />
                </div>

                {/* Tombol Submit dan Cancel */}
                <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '10px' }}>
                  <button
                    type="button"
                    onClick={toggleModal}
                    style={{
                      padding: '8px 16px',
                      backgroundColor: '#dc3545',
                      color: '#fff',
                      border: 'none',
                      borderRadius: '4px',
                      cursor: 'pointer',
                    }}
                  >
                    Cancel
                  </button>
                  <button
                    type="submit"
                    style={{
                      padding: '8px 16px',
                      backgroundColor: '#28a745',
                      color: '#fff',
                      border: 'none',
                      borderRadius: '4px',
                      cursor: 'pointer',
                    }}
                  >
                    Upload
                  </button>
                </div>
              </form>
            </div>
          </div>
        )}
      </>
    </div>
  );
};

export default Map;