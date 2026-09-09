import {safetyProjectsAPI} from '../../services/api';
export const getSafetyBuilders = () => safetyProjectsAPI.getBuilders({force: true});
