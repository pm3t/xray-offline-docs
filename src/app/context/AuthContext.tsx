import React, { createContext, useContext, useState, useEffect, type ReactNode } from 'react';

interface AuthContextType {
    user: any | null;
    isAdmin: boolean;
    login: (userData: any) => void;
    logout: () => void;
    loading: boolean;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export const AuthProvider: React.FC<{ children: ReactNode }> = ({ children }) => {
    const [user, setUser] = useState<any | null>(null);
    const [loading, setLoading] = useState(true);

    useEffect(() => {
        const savedUser = localStorage.getItem('currentUser');
        if (savedUser) {
            try {
                setUser(JSON.parse(savedUser));
            } catch (e) {
                localStorage.removeItem('currentUser');
            }
        }
        setLoading(false);
    }, []);

    const login = (userData: any) => {
        setUser(userData);
        localStorage.setItem('currentUser', JSON.stringify(userData));
    };

    const logout = () => {
        setUser(null);
        localStorage.removeItem('currentUser');
    };

    const isAdmin = user?.email === 'admin@technohub.co.id';

    return (
        <AuthContext.Provider value={{ user, isAdmin, login, logout, loading }}>
            {children}
        </AuthContext.Provider>
    );
};

export const useAuth = () => {
    const context = useContext(AuthContext);
    if (context === undefined) {
        throw new Error('useAuth must be used within an AuthProvider');
    }
    return context;
};
