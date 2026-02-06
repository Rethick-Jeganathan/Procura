import React, { useState, useEffect, useCallback } from 'react';
import {
  Key, Eye, EyeOff, Save, CheckCircle, XCircle, Loader2,
  RefreshCw, AlertTriangle, Shield, Cpu, Database, Bot,
  ChevronDown, ChevronRight, Zap, Settings as SettingsIcon
} from 'lucide-react';
import { api } from '../lib/api';

interface APIKeyInfo {
  label: string;
  category: string;
  description: string;
  configured: boolean;
  source: string | null;
  preview: string | null;
}

interface GeneralSettings {
  llm_provider: string;
  llm_model: string;
  llm_temperature: number;
  llm_max_tokens: number;
  openmanus_url: string;
  environment: string;
  debug: boolean;
}

type TestResult = { success: boolean; message?: string; error?: string } | null;

const Settings: React.FC = () => {
  const [activeTab, setActiveTab] = useState<'api-keys' | 'general'>('api-keys');
  const [keys, setKeys] = useState<Record<string, APIKeyInfo>>({});
  const [keyInputs, setKeyInputs] = useState<Record<string, string>>({});
  const [keyVisibility, setKeyVisibility] = useState<Record<string, boolean>>({});
  const [testResults, setTestResults] = useState<Record<string, TestResult>>({});
  const [testingKey, setTestingKey] = useState<string | null>(null);
  const [savingKey, setSavingKey] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [saveSuccess, setSaveSuccess] = useState<string | null>(null);

  // General settings state
  const [general, setGeneral] = useState<GeneralSettings | null>(null);
  const [generalLoading, setGeneralLoading] = useState(false);
  const [generalDirty, setGeneralDirty] = useState(false);
  const [savingGeneral, setSavingGeneral] = useState(false);

  // Expanded sections
  const [expandedSections, setExpandedSections] = useState<Record<string, boolean>>({
    discovery: true,
    ai: true,
    automation: true,
  });

  const loadAPIKeys = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const response = await api.getAPIKeys();
      if (response.error) {
        setError(response.error);
      } else if (response.data?.keys) {
        setKeys(response.data.keys);
      }
    } catch {
      setError('Failed to load API keys');
    } finally {
      setLoading(false);
    }
  }, []);

  const loadGeneral = useCallback(async () => {
    setGeneralLoading(true);
    try {
      const response = await api.getGeneralSettings();
      if (response.data) {
        setGeneral(response.data);
      }
    } catch {
      // ignore
    } finally {
      setGeneralLoading(false);
    }
  }, []);

  useEffect(() => {
    loadAPIKeys();
    loadGeneral();
  }, [loadAPIKeys, loadGeneral]);

  const handleSaveKey = async (keyName: string) => {
    const value = keyInputs[keyName]?.trim();
    if (!value) return;

    setSavingKey(keyName);
    setSaveSuccess(null);
    try {
      const response = await api.updateAPIKey(keyName, value);
      if (response.error) {
        setError(response.error);
      } else {
        setSaveSuccess(keyName);
        setKeyInputs(prev => ({ ...prev, [keyName]: '' }));
        await loadAPIKeys();
        setTimeout(() => setSaveSuccess(null), 3000);
      }
    } catch {
      setError(`Failed to save ${keyName}`);
    } finally {
      setSavingKey(null);
    }
  };

  const handleTestKey = async (keyName: string) => {
    setTestingKey(keyName);
    setTestResults(prev => ({ ...prev, [keyName]: null }));
    try {
      const response = await api.testAPIKey(keyName);
      if (response.data) {
        setTestResults(prev => ({ ...prev, [keyName]: response.data }));
      } else {
        setTestResults(prev => ({ ...prev, [keyName]: { success: false, error: response.error || 'Test failed' } }));
      }
    } catch {
      setTestResults(prev => ({ ...prev, [keyName]: { success: false, error: 'Network error' } }));
    } finally {
      setTestingKey(null);
    }
  };

  const handleDeleteKey = async (keyName: string) => {
    try {
      await api.deleteAPIKey(keyName);
      setKeyInputs(prev => ({ ...prev, [keyName]: '' }));
      await loadAPIKeys();
    } catch {
      setError(`Failed to delete ${keyName}`);
    }
  };

  const handleSaveGeneral = async () => {
    if (!general) return;
    setSavingGeneral(true);
    try {
      await api.updateGeneralSettings({
        llm_provider: general.llm_provider,
        llm_model: general.llm_model,
        llm_temperature: general.llm_temperature,
        llm_max_tokens: general.llm_max_tokens,
        openmanus_url: general.openmanus_url,
      });
      setGeneralDirty(false);
    } catch {
      setError('Failed to save general settings');
    } finally {
      setSavingGeneral(false);
    }
  };

  const toggleSection = (section: string) => {
    setExpandedSections(prev => ({ ...prev, [section]: !prev[section] }));
  };

  const categoryConfig: Record<string, { label: string; icon: React.ReactNode; description: string }> = {
    discovery: {
      label: 'Discovery Sources',
      icon: <Database size={20} />,
      description: 'API keys for government contract data sources',
    },
    ai: {
      label: 'AI Providers',
      icon: <Cpu size={20} />,
      description: 'LLM provider keys for opportunity qualification',
    },
    automation: {
      label: 'Automation',
      icon: <Bot size={20} />,
      description: 'Browser automation and submission tools',
    },
  };

  const renderKeyRow = (keyName: string, info: APIKeyInfo) => {
    const inputValue = keyInputs[keyName] || '';
    const isVisible = keyVisibility[keyName] || false;
    const testResult = testResults[keyName];
    const isTesting = testingKey === keyName;
    const isSaving = savingKey === keyName;
    const justSaved = saveSuccess === keyName;

    return (
      <div key={keyName} className="p-4 rounded-xl border border-gray-100 bg-white hover:border-gray-200 transition-colors">
        <div className="flex items-start justify-between mb-3">
          <div>
            <div className="flex items-center gap-2">
              <h4 className="text-sm font-semibold text-gray-900">{info.label}</h4>
              {info.configured ? (
                <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-medium bg-green-50 text-green-700 border border-green-200">
                  <CheckCircle size={10} /> Configured
                </span>
              ) : (
                <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-medium bg-amber-50 text-amber-700 border border-amber-200">
                  <AlertTriangle size={10} /> Not Set
                </span>
              )}
              {info.source && (
                <span className="text-[10px] text-gray-400 font-medium uppercase">{info.source}</span>
              )}
            </div>
            <p className="text-xs text-gray-500 mt-0.5">{info.description}</p>
          </div>
          <div className="flex items-center gap-1.5">
            {info.configured && (
              <button
                onClick={() => handleTestKey(keyName)}
                disabled={isTesting}
                className="flex items-center gap-1 px-2.5 py-1.5 text-xs font-medium rounded-lg border border-gray-200 text-gray-600 hover:bg-gray-50 disabled:opacity-50 transition-colors"
              >
                {isTesting ? <Loader2 size={12} className="animate-spin" /> : <Zap size={12} />}
                Test
              </button>
            )}
            {info.configured && info.source === 'database' && (
              <button
                onClick={() => handleDeleteKey(keyName)}
                className="px-2.5 py-1.5 text-xs font-medium rounded-lg border border-red-200 text-red-600 hover:bg-red-50 transition-colors"
              >
                Remove
              </button>
            )}
          </div>
        </div>

        {/* Current masked value */}
        {info.configured && info.preview && (
          <div className="flex items-center gap-2 mb-3">
            <span className="text-xs text-gray-400">Current:</span>
            <code className="text-xs font-mono bg-gray-50 px-2 py-1 rounded text-gray-600">{info.preview}</code>
          </div>
        )}

        {/* Test result */}
        {testResult && (
          <div className={`flex items-center gap-2 mb-3 p-2 rounded-lg text-xs font-medium ${testResult.success ? 'bg-green-50 text-green-700' : 'bg-red-50 text-red-700'}`}>
            {testResult.success ? <CheckCircle size={14} /> : <XCircle size={14} />}
            {testResult.success ? (testResult.message || 'Connection successful') : (testResult.error || 'Connection failed')}
          </div>
        )}

        {/* Input field */}
        <div className="flex items-center gap-2">
          <div className="relative flex-1">
            <Key size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
            <input
              type={isVisible ? 'text' : 'password'}
              value={inputValue}
              onChange={(e) => setKeyInputs(prev => ({ ...prev, [keyName]: e.target.value }))}
              placeholder={info.configured ? 'Enter new key to update...' : 'Enter API key...'}
              className="w-full pl-9 pr-10 py-2 text-sm border border-gray-200 rounded-lg focus:ring-2 focus:ring-gray-900 focus:border-gray-900 outline-none font-mono placeholder:font-sans transition-all"
            />
            <button
              onClick={() => setKeyVisibility(prev => ({ ...prev, [keyName]: !isVisible }))}
              className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600"
            >
              {isVisible ? <EyeOff size={14} /> : <Eye size={14} />}
            </button>
          </div>
          <button
            onClick={() => handleSaveKey(keyName)}
            disabled={!inputValue.trim() || isSaving}
            className={`flex items-center gap-1.5 px-4 py-2 text-sm font-medium rounded-lg transition-all disabled:opacity-50 disabled:cursor-not-allowed ${
              justSaved
                ? 'bg-green-600 text-white'
                : 'bg-gray-900 text-white hover:bg-gray-800'
            }`}
          >
            {isSaving ? (
              <Loader2 size={14} className="animate-spin" />
            ) : justSaved ? (
              <CheckCircle size={14} />
            ) : (
              <Save size={14} />
            )}
            {justSaved ? 'Saved' : 'Save'}
          </button>
        </div>
      </div>
    );
  };

  const keysByCategory = Object.entries(keys).reduce<Record<string, [string, APIKeyInfo][]>>((acc, [keyName, info]) => {
    const cat = info.category || 'other';
    if (!acc[cat]) acc[cat] = [];
    acc[cat].push([keyName, info]);
    return acc;
  }, {});

  return (
    <div className="flex-1 flex flex-col min-w-0 bg-gray-50 overflow-hidden">
      {/* Header */}
      <div className="h-16 flex items-center justify-between px-6 border-b border-gray-200 bg-white shrink-0">
        <div className="flex items-center gap-3">
          <div className="h-9 w-9 rounded-xl bg-gray-900 flex items-center justify-center">
            <SettingsIcon size={18} className="text-white" />
          </div>
          <div>
            <h1 className="text-lg font-bold text-gray-900">Settings</h1>
            <p className="text-xs text-gray-500">Manage API keys, providers, and system configuration</p>
          </div>
        </div>
        <button
          onClick={() => { loadAPIKeys(); loadGeneral(); }}
          className="flex items-center gap-2 px-3 py-2 text-sm text-gray-600 hover:bg-gray-100 rounded-lg transition-colors"
        >
          <RefreshCw size={14} />
          Refresh
        </button>
      </div>

      {/* Tabs */}
      <div className="px-6 pt-4 bg-white border-b border-gray-200 shrink-0">
        <div className="flex gap-1">
          <button
            onClick={() => setActiveTab('api-keys')}
            className={`px-4 py-2.5 text-sm font-medium rounded-t-lg transition-colors border-b-2 ${
              activeTab === 'api-keys'
                ? 'border-gray-900 text-gray-900 bg-gray-50'
                : 'border-transparent text-gray-500 hover:text-gray-700'
            }`}
          >
            <div className="flex items-center gap-2">
              <Key size={16} />
              API Keys
            </div>
          </button>
          <button
            onClick={() => setActiveTab('general')}
            className={`px-4 py-2.5 text-sm font-medium rounded-t-lg transition-colors border-b-2 ${
              activeTab === 'general'
                ? 'border-gray-900 text-gray-900 bg-gray-50'
                : 'border-transparent text-gray-500 hover:text-gray-700'
            }`}
          >
            <div className="flex items-center gap-2">
              <SettingsIcon size={16} />
              General
            </div>
          </button>
        </div>
      </div>

      {/* Content */}
      <div className="flex-1 overflow-y-auto p-6">
        {/* Error banner */}
        {error && (
          <div className="mb-4 p-3 rounded-xl border border-red-200 bg-red-50 flex items-center gap-2">
            <XCircle size={16} className="text-red-600 shrink-0" />
            <p className="text-sm text-red-700">{error}</p>
            <button onClick={() => setError(null)} className="ml-auto text-red-400 hover:text-red-600">
              <XCircle size={14} />
            </button>
          </div>
        )}

        {/* API Keys Tab */}
        {activeTab === 'api-keys' && (
          <div className="max-w-3xl space-y-4">
            {loading ? (
              <div className="flex items-center justify-center py-20">
                <Loader2 size={32} className="animate-spin text-gray-400" />
              </div>
            ) : (
              <>
                {/* Info banner */}
                <div className="p-4 rounded-xl border border-blue-100 bg-blue-50 flex items-start gap-3">
                  <Shield size={18} className="text-blue-600 mt-0.5 shrink-0" />
                  <div>
                    <p className="text-sm font-medium text-blue-900">Secure Key Storage</p>
                    <p className="text-xs text-blue-700 mt-0.5">
                      API keys are encrypted with AES-128 (Fernet) before storage. Keys stored here override environment variables.
                    </p>
                  </div>
                </div>

                {/* Category sections */}
                {Object.entries(categoryConfig).map(([category, config]) => {
                  const categoryKeys = keysByCategory[category] || [];
                  if (categoryKeys.length === 0) return null;
                  const isExpanded = expandedSections[category] !== false;

                  return (
                    <div key={category} className="rounded-2xl border border-gray-200 bg-gray-50/50 overflow-hidden">
                      <button
                        onClick={() => toggleSection(category)}
                        className="w-full flex items-center justify-between p-4 hover:bg-gray-100/50 transition-colors"
                      >
                        <div className="flex items-center gap-3">
                          <div className="h-10 w-10 rounded-xl bg-white border border-gray-200 flex items-center justify-center text-gray-600">
                            {config.icon}
                          </div>
                          <div className="text-left">
                            <h3 className="text-sm font-semibold text-gray-900">{config.label}</h3>
                            <p className="text-xs text-gray-500">{config.description}</p>
                          </div>
                        </div>
                        <div className="flex items-center gap-2">
                          <span className="text-xs text-gray-400">
                            {categoryKeys.filter(([, info]) => info.configured).length}/{categoryKeys.length} configured
                          </span>
                          {isExpanded ? <ChevronDown size={16} className="text-gray-400" /> : <ChevronRight size={16} className="text-gray-400" />}
                        </div>
                      </button>
                      {isExpanded && (
                        <div className="p-4 pt-0 space-y-3">
                          {categoryKeys.map(([keyName, info]) => renderKeyRow(keyName, info))}
                        </div>
                      )}
                    </div>
                  );
                })}
              </>
            )}
          </div>
        )}

        {/* General Tab */}
        {activeTab === 'general' && (
          <div className="max-w-3xl space-y-6">
            {generalLoading ? (
              <div className="flex items-center justify-center py-20">
                <Loader2 size={32} className="animate-spin text-gray-400" />
              </div>
            ) : general ? (
              <>
                {/* LLM Configuration */}
                <div className="rounded-2xl border border-gray-200 bg-white p-6 space-y-5">
                  <div className="flex items-center gap-3 mb-1">
                    <div className="h-10 w-10 rounded-xl bg-gray-100 flex items-center justify-center">
                      <Cpu size={20} className="text-gray-600" />
                    </div>
                    <div>
                      <h3 className="text-sm font-semibold text-gray-900">LLM Configuration</h3>
                      <p className="text-xs text-gray-500">Configure the AI provider for opportunity qualification</p>
                    </div>
                  </div>

                  <div className="grid grid-cols-2 gap-4">
                    <div>
                      <label className="block text-xs font-medium text-gray-600 mb-1.5">Provider</label>
                      <select
                        value={general.llm_provider}
                        onChange={(e) => { setGeneral({ ...general, llm_provider: e.target.value }); setGeneralDirty(true); }}
                        className="w-full px-3 py-2 text-sm border border-gray-200 rounded-lg focus:ring-2 focus:ring-gray-900 focus:border-gray-900 outline-none bg-white"
                      >
                        <option value="anthropic">Anthropic (Claude)</option>
                        <option value="openai">OpenAI (GPT-4)</option>
                        <option value="google">Google (Gemini)</option>
                      </select>
                    </div>
                    <div>
                      <label className="block text-xs font-medium text-gray-600 mb-1.5">Model</label>
                      <input
                        type="text"
                        value={general.llm_model}
                        onChange={(e) => { setGeneral({ ...general, llm_model: e.target.value }); setGeneralDirty(true); }}
                        className="w-full px-3 py-2 text-sm border border-gray-200 rounded-lg focus:ring-2 focus:ring-gray-900 focus:border-gray-900 outline-none font-mono"
                      />
                    </div>
                  </div>

                  <div className="grid grid-cols-2 gap-4">
                    <div>
                      <label className="block text-xs font-medium text-gray-600 mb-1.5">
                        Temperature: {general.llm_temperature}
                      </label>
                      <input
                        type="range"
                        min="0"
                        max="1"
                        step="0.1"
                        value={general.llm_temperature}
                        onChange={(e) => { setGeneral({ ...general, llm_temperature: parseFloat(e.target.value) }); setGeneralDirty(true); }}
                        className="w-full h-2 bg-gray-200 rounded-lg appearance-none cursor-pointer accent-gray-900"
                      />
                      <div className="flex justify-between text-[10px] text-gray-400 mt-1">
                        <span>Precise</span>
                        <span>Creative</span>
                      </div>
                    </div>
                    <div>
                      <label className="block text-xs font-medium text-gray-600 mb-1.5">Max Tokens</label>
                      <input
                        type="number"
                        value={general.llm_max_tokens}
                        onChange={(e) => { setGeneral({ ...general, llm_max_tokens: parseInt(e.target.value) || 2048 }); setGeneralDirty(true); }}
                        className="w-full px-3 py-2 text-sm border border-gray-200 rounded-lg focus:ring-2 focus:ring-gray-900 focus:border-gray-900 outline-none"
                        min={256}
                        max={8192}
                      />
                    </div>
                  </div>
                </div>

                {/* OpenManus Configuration */}
                <div className="rounded-2xl border border-gray-200 bg-white p-6 space-y-5">
                  <div className="flex items-center gap-3 mb-1">
                    <div className="h-10 w-10 rounded-xl bg-gray-100 flex items-center justify-center">
                      <Bot size={20} className="text-gray-600" />
                    </div>
                    <div>
                      <h3 className="text-sm font-semibold text-gray-900">Automation</h3>
                      <p className="text-xs text-gray-500">Browser automation service configuration</p>
                    </div>
                  </div>

                  <div>
                    <label className="block text-xs font-medium text-gray-600 mb-1.5">OpenManus API URL</label>
                    <input
                      type="url"
                      value={general.openmanus_url}
                      onChange={(e) => { setGeneral({ ...general, openmanus_url: e.target.value }); setGeneralDirty(true); }}
                      placeholder="http://localhost:8080"
                      className="w-full px-3 py-2 text-sm border border-gray-200 rounded-lg focus:ring-2 focus:ring-gray-900 focus:border-gray-900 outline-none font-mono"
                    />
                  </div>
                </div>

                {/* Environment Info (read-only) */}
                <div className="rounded-2xl border border-gray-200 bg-white p-6">
                  <h3 className="text-sm font-semibold text-gray-900 mb-4">Environment</h3>
                  <div className="grid grid-cols-2 gap-4 text-sm">
                    <div className="flex justify-between p-3 bg-gray-50 rounded-lg">
                      <span className="text-gray-500">Environment</span>
                      <span className="font-medium text-gray-900">{general.environment}</span>
                    </div>
                    <div className="flex justify-between p-3 bg-gray-50 rounded-lg">
                      <span className="text-gray-500">Debug Mode</span>
                      <span className={`font-medium ${general.debug ? 'text-amber-600' : 'text-green-600'}`}>
                        {general.debug ? 'Enabled' : 'Disabled'}
                      </span>
                    </div>
                  </div>
                </div>

                {/* Save button */}
                {generalDirty && (
                  <div className="sticky bottom-0 bg-gray-50 pt-4 pb-2">
                    <button
                      onClick={handleSaveGeneral}
                      disabled={savingGeneral}
                      className="flex items-center gap-2 px-6 py-2.5 bg-gray-900 text-white rounded-xl text-sm font-medium hover:bg-gray-800 disabled:opacity-50 transition-all shadow-lg"
                    >
                      {savingGeneral ? <Loader2 size={16} className="animate-spin" /> : <Save size={16} />}
                      Save Changes
                    </button>
                  </div>
                )}
              </>
            ) : (
              <div className="text-center py-20 text-gray-500">
                <SettingsIcon size={32} className="mx-auto mb-3 text-gray-300" />
                <p className="text-sm">Unable to load settings</p>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
};

export default Settings;
