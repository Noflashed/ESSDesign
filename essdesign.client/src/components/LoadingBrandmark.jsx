const ESS_LOADING_LOGO_URL = 'https://jyjsbbugskbbhibhlyks.supabase.co/storage/v1/object/public/public-assets/logo.png';

export default function LoadingBrandmark({ label = 'Loading' }) {
    return (
        <div className="loading-brandmark" role="status" aria-label={label}>
            <div className="loading-ring" aria-hidden="true"></div>
            <img src={ESS_LOADING_LOGO_URL} alt="ErectSafe Scaffolding" className="loading-logo" />
        </div>
    );
}
