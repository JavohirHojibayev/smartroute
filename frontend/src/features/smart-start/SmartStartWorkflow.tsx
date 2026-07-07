import React, { useState } from 'react';
import { CheckCircle2, XCircle, Clock, ShieldCheck, Activity, Wrench, FileCheck } from 'lucide-react';
import { motion } from 'framer-motion';

type StepStatus = 'pending' | 'passed' | 'failed' | 'current';

interface StepProps {
  icon: React.ReactNode;
  title: string;
  description: string;
  status: StepStatus;
}

const Step = ({ icon, title, description, status }: StepProps) => {
  const getStatusColor = () => {
    switch (status) {
      case 'passed': return 'text-emerald-400 border-emerald-500/30 bg-emerald-500/10';
      case 'failed': return 'text-red-400 border-red-500/30 bg-red-500/10';
      case 'current': return 'text-blue-400 border-blue-500/30 bg-blue-500/10 shadow-[0_0_15px_rgba(59,130,246,0.3)] anim-pulse';
      default: return 'text-slate-500 border-slate-700 bg-slate-800/20';
    }
  };

  const getIcon = () => {
    if (status === 'passed') return <CheckCircle2 size={18} />;
    if (status === 'failed') return <XCircle size={18} />;
    if (status === 'current') return <Clock size={18} className="animate-spin-slow" />;
    return null;
  };

  return (
    <div className={`p-4 rounded-2xl border transition-all duration-500 flex items-center gap-4 ${getStatusColor()}`}>
      <div className="p-3 rounded-xl bg-slate-900/50">
        {icon}
      </div>
      <div className="flex-1">
        <h4 className="font-semibold text-sm">{title}</h4>
        <p className="text-xs opacity-70">{description}</p>
      </div>
      <div className="shrink-0">
        {getIcon()}
      </div>
    </div>
  );
};

export const SmartStartWorkflow = () => {
  const [activeStep, setActiveStep] = useState(0);

  const steps = [
    { 
      title: 'Hikvision Face ID', 
      desc: 'Turniketdan hovliga kirish', 
      icon: <ShieldCheck size={20} />,
      status: activeStep > 0 ? 'passed' : activeStep === 0 ? 'current' : 'pending' 
    },
    { 
      title: 'ESMO Medical Check', 
      desc: 'Qon bosimi va alkogol testi', 
      icon: <Activity size={20} />,
      status: activeStep > 1 ? 'passed' : activeStep === 1 ? 'current' : 'pending' 
    },
    { 
      title: 'Mechanic Sign-off', 
      desc: 'Avtomobil sozligi tasdiqlanishi', 
      icon: <Wrench size={20} />,
      status: activeStep > 2 ? 'passed' : activeStep === 2 ? 'current' : 'pending' 
    },
    { 
      title: 'Digital Waybill', 
      desc: 'Yo\'l varaqasini yaratish', 
      icon: <FileCheck size={20} />,
      status: activeStep > 3 ? 'passed' : activeStep === 3 ? 'current' : 'pending' 
    },
  ];

  return (
    <div className="space-y-4">
      <div className="flex justify-between items-center mb-2">
        <h3 className="font-bold text-lg">Smart Start Workflow</h3>
        <button 
          onClick={() => setActiveStep((prev) => (prev + 1) % 5)}
          className="text-xs px-3 py-1 bg-slate-700 hover:bg-slate-600 rounded-lg transition-colors border border-slate-600"
        >
          Mock Next Step
        </button>
      </div>
      
      <div className="space-y-3 relative">
        {/* Connection line */}
        <div className="absolute left-[34px] top-4 bottom-4 w-[2px] bg-slate-800 -z-10"></div>
        
        {steps.map((step, idx) => (
          <motion.div
            key={idx}
            initial={{ opacity: 0, x: -10 }}
            animate={{ opacity: 1, x: 0 }}
            transition={{ delay: idx * 0.1 }}
          >
            <Step 
              icon={step.icon}
              title={step.title}
              description={step.desc}
              status={step.status as StepStatus}
            />
          </motion.div>
        ))}
      </div>
    </div>
  );
};
