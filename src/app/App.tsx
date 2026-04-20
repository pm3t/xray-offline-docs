import { BrowserRouter, Routes, Route } from 'react-router-dom';
import Layout from './components/Layout';
import InputDataScreen from './components/InputDataScreen';
import ScreeningScreen from './components/ScreeningScreen';
import RepositoryScreen from './components/RepositoryScreen';
import CustomsDashboardScreen from './components/CustomsDashboardScreen';
import SettingsScreen from './components/SettingsScreen';

const App = () => {
    return (
        <BrowserRouter>
            <Routes>
                <Route path="/" element={<Layout />}>
                    <Route index element={<InputDataScreen />} />
                    <Route path="screening/:cargoId?" element={<ScreeningScreen />} />
                    <Route path="repository" element={<RepositoryScreen />} />
                    <Route path="customs" element={<CustomsDashboardScreen />} />
                    <Route path="settings" element={<SettingsScreen />} />
                </Route>
            </Routes>
        </BrowserRouter>
    );
};

export default App;
