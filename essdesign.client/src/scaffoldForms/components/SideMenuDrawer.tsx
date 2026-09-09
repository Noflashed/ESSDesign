import React from 'react';
import {Modal, View, Text, TouchableOpacity} from '../browser/runtime';
export default function SideMenuDrawer({visible, onClose, onGoSafety}) {
 return <Modal visible={visible} transparent onRequestClose={onClose}><View style={{flex:1, backgroundColor:'#ffffff', padding:24}}>
 <TouchableOpacity onPress={onClose}><Text>Close menu</Text></TouchableOpacity>
 <TouchableOpacity onPress={onGoSafety} style={{paddingTop:24}}><Text>Back to Scaffold Register</Text></TouchableOpacity>
 </View></Modal>;
}
