import Modal from './Modal';

interface Props {
  onClose: () => void;
  onOpenSettings: () => void;
}

export default function ApiGateModal({ onClose, onOpenSettings }: Props) {
  return (
    <Modal title="Fonction avancée IA" onClose={onClose}>
      <p className="text-sm text-gray-600 dark:text-gray-300 mb-6">
        Pour utiliser cette fonction, inscrire votre code API (obtenu auprès du service de TI).
      </p>
      <div className="flex gap-3">
        <button
          onClick={onClose}
          className="flex-1 py-2 rounded-lg border border-gray-300 dark:border-gray-600 text-sm text-gray-700 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-800 transition-colors"
        >
          Annuler
        </button>
        <button
          onClick={() => {
            onClose();
            onOpenSettings();
          }}
          className="flex-1 py-2 rounded-lg bg-evoq text-white text-sm font-medium hover:bg-evoq-dark transition-colors"
        >
          Paramètres
        </button>
      </div>
    </Modal>
  );
}
