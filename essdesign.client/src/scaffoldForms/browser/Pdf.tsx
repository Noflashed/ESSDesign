import React from 'react';
export default function Pdf({source, onError}) {
    return <iframe title="Pre-Start PDF" src={source.uri} onError={onError} style={{flex: 1, width: '100%', border: 0}} />;
}
