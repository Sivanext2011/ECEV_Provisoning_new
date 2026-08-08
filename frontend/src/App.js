import { jsx as _jsx, jsxs as _jsxs } from "react/jsx-runtime";
import { useState } from 'react';
import { ProvisionWizard } from './components/ProvisionWizard';
import { CRMView } from './components/CRMView';
import { CatalogPanel } from './components/CatalogPanel';
import { OperationsPanel } from './components/OperationsPanel';
import { POPublishPanel } from './components/POPublishPanel';
import { SettingsPanel } from './components/SettingsPanel';
import { ApiLogsPanel } from './components/ApiLogsPanel';
import { TraceTraffic } from './components/TraceTraffic';
const tabs = [
    { key: 'provision', label: 'Provision Subscriber', icon: '⚡' },
    { key: '360', label: '360° View', icon: '🔍' },
    { key: 'catalog', label: 'Catalog', icon: '📋' },
    { key: 'operations', label: 'Operations', icon: '⚙️' },
    { key: 'trace', label: 'Trace & Traffic', icon: '📡' },
    { key: 'publish', label: 'PO Publish', icon: '📤' },
    { key: 'settings', label: 'Settings', icon: '🛠️' },
    { key: 'logs', label: 'API Logs', icon: '📊' },
];
const styles = {
    appContainer: {
        display: 'flex',
        flexDirection: 'column',
        height: '100vh',
        fontFamily: "'Segoe UI', -apple-system, BlinkMacSystemFont, 'Roboto', sans-serif",
        backgroundColor: '#f0f2f5',
        color: '#1a1a2e',
        overflow: 'hidden',
    },
    header: {
        background: 'linear-gradient(135deg, #1a1a2e 0%, #16213e 50%, #0f3460 100%)',
        padding: '0 32px',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        height: '64px',
        boxShadow: '0 2px 12px rgba(0, 0, 0, 0.3)',
        position: 'relative',
        zIndex: 10,
    },
    headerTitle: {
        display: 'flex',
        alignItems: 'center',
        gap: '12px',
    },
    logoMark: {
        width: '36px',
        height: '36px',
        borderRadius: '8px',
        background: 'linear-gradient(135deg, #e94560 0%, #ff6b6b 100%)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        fontSize: '18px',
        fontWeight: 700,
        color: '#ffffff',
        boxShadow: '0 2px 8px rgba(233, 69, 96, 0.4)',
    },
    titleText: {
        fontSize: '20px',
        fontWeight: 600,
        color: '#ffffff',
        letterSpacing: '-0.3px',
    },
    titleSub: {
        fontSize: '11px',
        color: 'rgba(255, 255, 255, 0.5)',
        fontWeight: 400,
        letterSpacing: '1.5px',
        textTransform: 'uppercase',
        marginLeft: '12px',
    },
    headerRight: {
        display: 'flex',
        alignItems: 'center',
        gap: '16px',
    },
    envBadge: {
        padding: '4px 10px',
        borderRadius: '12px',
        fontSize: '11px',
        fontWeight: 600,
        backgroundColor: 'rgba(0, 200, 150, 0.15)',
        color: '#00c896',
        border: '1px solid rgba(0, 200, 150, 0.3)',
        letterSpacing: '0.5px',
        textTransform: 'uppercase',
    },
    navBar: {
        backgroundColor: '#ffffff',
        padding: '0 32px',
        display: 'flex',
        alignItems: 'center',
        gap: '4px',
        height: '52px',
        borderBottom: '1px solid #e4e7ec',
        boxShadow: '0 1px 4px rgba(0, 0, 0, 0.04)',
        overflowX: 'auto',
    },
    tab: {
        padding: '8px 18px',
        borderRadius: '24px',
        border: 'none',
        cursor: 'pointer',
        fontSize: '13px',
        fontWeight: 500,
        color: '#5a6072',
        backgroundColor: 'transparent',
        transition: 'all 0.2s ease',
        whiteSpace: 'nowrap',
        display: 'flex',
        alignItems: 'center',
        gap: '6px',
        outline: 'none',
    },
    tabActive: {
        padding: '8px 18px',
        borderRadius: '24px',
        border: 'none',
        cursor: 'pointer',
        fontSize: '13px',
        fontWeight: 600,
        color: '#ffffff',
        background: 'linear-gradient(135deg, #e94560 0%, #ff6b6b 100%)',
        boxShadow: '0 2px 8px rgba(233, 69, 96, 0.3)',
        whiteSpace: 'nowrap',
        display: 'flex',
        alignItems: 'center',
        gap: '6px',
        outline: 'none',
        transition: 'all 0.2s ease',
    },
    tabHover: {
        backgroundColor: '#f4f5f7',
        color: '#1a1a2e',
    },
    contentArea: {
        flex: 1,
        padding: '24px 32px',
        overflow: 'auto',
    },
    contentCard: {
        backgroundColor: '#ffffff',
        borderRadius: '12px',
        boxShadow: '0 1px 6px rgba(0, 0, 0, 0.06), 0 4px 16px rgba(0, 0, 0, 0.04)',
        padding: '24px',
        minHeight: 'calc(100vh - 200px)',
        border: '1px solid #ebedf0',
    },
};
function App() {
    const [activeTab, setActiveTab] = useState('provision');
    const [hoveredTab, setHoveredTab] = useState(null);
    const renderContent = () => {
        switch (activeTab) {
            case 'provision':
                return _jsx(ProvisionWizard, {});
            case '360':
                return _jsx(CRMView, {});
            case 'catalog':
                return _jsx(CatalogPanel, {});
            case 'operations':
                return _jsx(OperationsPanel, {});
            case 'trace':
                return _jsx(TraceTraffic, {});
            case 'publish':
                return _jsx(POPublishPanel, {});
            case 'settings':
                return _jsx(SettingsPanel, {});
            case 'logs':
                return _jsx(ApiLogsPanel, {});
            default:
                return _jsx(ProvisionWizard, {});
        }
    };
    return (_jsxs("div", { style: styles.appContainer, children: [_jsxs("header", { style: styles.header, children: [_jsxs("div", { style: styles.headerTitle, children: [_jsx("div", { style: styles.logoMark, children: "E" }), _jsx("span", { style: styles.titleText, children: "ECEV Provisioning" }), _jsx("span", { style: styles.titleSub, children: "Admin Console" })] }), _jsx("div", { style: styles.headerRight, children: _jsx("span", { style: styles.envBadge, children: "\u25CF Connected" }) })] }), _jsx("nav", { style: styles.navBar, children: tabs.map((tab) => {
                    const isActive = activeTab === tab.key;
                    const isHovered = hoveredTab === tab.key && !isActive;
                    return (_jsxs("button", { onClick: () => setActiveTab(tab.key), onMouseEnter: () => setHoveredTab(tab.key), onMouseLeave: () => setHoveredTab(null), style: {
                            ...(isActive ? styles.tabActive : styles.tab),
                            ...(isHovered ? styles.tabHover : {}),
                        }, children: [_jsx("span", { style: { fontSize: '14px' }, children: tab.icon }), tab.label] }, tab.key));
                }) }), _jsx("main", { style: styles.contentArea, children: _jsx("div", { style: styles.contentCard, children: renderContent() }) })] }));
}
export default App;
