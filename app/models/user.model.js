import mongoose from 'mongoose';

const UserSchema = new mongoose.Schema({ 
    username: {
        type: String,
        unique: true,
        required: true
    },
    password: {
        type: String,
        required: true
    },

    name: String,
    email: String,
    contact: String,
    isActive: Boolean,

    userType: {
        type: String,
        enum : ['student', 'lecturer', 'admin'],
    },
}, {
    timestamps: true
});

module.exports = mongoose.model('User', UserSchema);