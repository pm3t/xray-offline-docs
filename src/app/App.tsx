import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { AuthProvider, useAuth } from './context/AuthContext';
import Layout from './components/Layout';
import InputDataScreen from './components/InputDataScreen';
import ScreeningScreen from './components/ScreeningScreen';
import RepositoryScreen from './components/RepositoryScreen';
import CustomsDashboardScreen from './components/CustomsDashboardScreen';
import SettingsScreen from './components/SettingsScreen';
import LoginScreen from './components/LoginScreen';
import UserManagementScreen from './components/UserManagementScreen';

const AppRoutes = () => {
    const { user, isAdmin, login, loading } = useAuth();

    if (loading) return null;

    return (
        <Routes>
            <Route
                path="/login"
                element={!user ? <LoginScreen onLogin={login} /> : <Navigate to="/" replace />}
            />

            <Route
                path="/"
                element={user ? <Layout /> : <Navigate to="/login" replace />}
            >
                <Route index element={<InputDataScreen />} />
                <Route path="screening/:cargoId?" element={<ScreeningScreen />} />
                <Route path="repository" element={<RepositoryScreen />} />
                <Route path="customs" element={<CustomsDashboardScreen />} />
                <Route path="settings" element={<SettingsScreen />} />
                <Route path="users" element={isAdmin ? <UserManagementScreen /> : <Navigate to="/" replace />} />
            </Route>

            <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
    );
};

const App = () => {
    return (
        <AuthProvider>
            <BrowserRouter>
                <AppRoutes />
            </BrowserRouter>
        </AuthProvider>
    );
};

export default App;
