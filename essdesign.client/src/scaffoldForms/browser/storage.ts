export default {
 getItem: async key => localStorage.getItem(key),
 setItem: async (key, value) => localStorage.setItem(key, value),
 removeItem: async key => localStorage.removeItem(key),
};
