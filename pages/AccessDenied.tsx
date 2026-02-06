import React from 'react';
import { useNavigate } from 'react-router-dom';
import { ShieldAlert, ArrowLeft, Lock } from 'lucide-react';

const AccessDenied: React.FC = () => {
   const navigate = useNavigate();

   return (
      <div className="flex-1 flex flex-col items-center justify-center bg-gray-50 p-6">
         <div className="w-full max-w-md bg-white rounded-2xl shadow-sm border border-gray-100 p-8 text-center">
            <div className="mx-auto h-20 w-20 bg-red-50 rounded-2xl flex items-center justify-center mb-6">
               <ShieldAlert size={40} className="text-red-600" />
            </div>

            <h1 className="text-2xl font-bold text-gray-900 mb-2">Access Denied</h1>
            <p className="text-gray-500 mb-8 leading-relaxed">
               You don't have the required permissions to access this restricted area. This event has been logged for security purposes.
            </p>

            <div className="space-y-3">
               <button
                  onClick={() => navigate('/dashboard')}
                  className="w-full py-3 bg-gray-900 text-white font-medium rounded-lg hover:bg-gray-800 transition-all flex items-center justify-center gap-2"
               >
                  <ArrowLeft size={18} />
                  Return to Dashboard
               </button>
               <button className="w-full py-3 border border-gray-200 text-gray-700 font-medium rounded-lg hover:bg-gray-50 transition-all flex items-center justify-center gap-2">
                  <Lock size={18} />
                  Request Admin Access
               </button>
            </div>

            <div className="mt-8 pt-6 border-t border-gray-100">
               <div className="flex items-center justify-center gap-2 text-xs text-gray-400 font-mono bg-gray-50 py-2 rounded-lg">
                  <span>ERR_403_FORBIDDEN</span>
               </div>
            </div>
         </div>

         <p className="text-xs text-gray-400 mt-8">
            © {new Date().getFullYear()} Procura Ops Command.
         </p>
      </div>
   );
};

export default AccessDenied;