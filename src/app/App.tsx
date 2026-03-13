import React from 'react';
import { BrowserRouter, Routes, Route } from 'react-router-dom';
import Layout from './components/Layout';
import InputDataScreen from './components/InputDataScreen';
import ScreeningScreen from './components/ScreeningScreen';
import RepositoryScreen from './components/RepositoryScreen';

const App = () => {
    return (
        <BrowserRouter>
            <Routes>
                <Route path="/" element={<Layout />}>
                    <Route index element={<InputDataScreen />} />
                    <Route path="screening/:cargoId" element={<ScreeningScreen />} />
                    <Route path="repository" element={<RepositoryScreen />} />
                </Route>
            </Routes>
        </BrowserRouter>
    );
};

export default App;
